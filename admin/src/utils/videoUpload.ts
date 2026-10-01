export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export interface BlobUploadResult {
  success: boolean;
  error?: string;
  status?: number;
}

/** Above this, upload as blocks: a single Put Blob request tops out near 4.7 GB. */
const BLOCK_UPLOAD_THRESHOLD = 256 * 1024 * 1024;
const BLOCK_SIZE = 64 * 1024 * 1024;
const BLOCK_RETRIES = 3;

export async function uploadToBlob(
  uploadUrl: string,
  file: File,
  contentType: string,
  onProgress?: (progress: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<BlobUploadResult> {
  if (file.size > BLOCK_UPLOAD_THRESHOLD) {
    return uploadInBlocks(uploadUrl, file, contentType, onProgress, signal);
  }
  return putRequest(uploadUrl, file, { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': contentType }, (loaded) =>
    reportProgress(onProgress, loaded, file.size), signal);
}

function reportProgress(
  onProgress: ((progress: UploadProgress) => void) | undefined,
  loaded: number,
  total: number,
) {
  onProgress?.({ loaded, total, percent: total > 0 ? Math.round((loaded / total) * 100) : 0 });
}

function withQuery(uploadUrl: string, params: Record<string, string>): string {
  const url = new URL(uploadUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

/** Put Block × N, then Put Block List — supports files far beyond the single-request limit. */
async function uploadInBlocks(
  uploadUrl: string,
  file: File,
  contentType: string,
  onProgress?: (progress: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<BlobUploadResult> {
  const blockCount = Math.ceil(file.size / BLOCK_SIZE);
  const blockIds: string[] = [];
  let uploaded = 0;

  for (let i = 0; i < blockCount; i++) {
    // Block ids must all be the same length before encoding.
    const blockId = btoa(String(i).padStart(6, '0'));
    blockIds.push(blockId);
    const chunk = file.slice(i * BLOCK_SIZE, Math.min(file.size, (i + 1) * BLOCK_SIZE));
    const url = withQuery(uploadUrl, { comp: 'block', blockid: blockId });

    let result: BlobUploadResult = { success: false, error: 'Upload failed.' };
    for (let attempt = 1; attempt <= BLOCK_RETRIES; attempt++) {
      result = await putRequest(url, chunk, {}, (loaded) =>
        reportProgress(onProgress, uploaded + loaded, file.size), signal);
      if (result.success || result.status === 403 || signal?.aborted) break;
    }
    if (!result.success) return result;
    uploaded += chunk.size;
    reportProgress(onProgress, uploaded, file.size);
  }

  const body =
    '<?xml version="1.0" encoding="utf-8"?><BlockList>' +
    blockIds.map((id) => `<Latest>${id}</Latest>`).join('') +
    '</BlockList>';
  return putRequest(
    withQuery(uploadUrl, { comp: 'blocklist' }),
    body,
    { 'x-ms-blob-content-type': contentType, 'Content-Type': 'application/xml' },
    undefined,
    signal,
  );
}

function putRequest(
  url: string,
  body: XMLHttpRequestBodyInit,
  headers: Record<string, string>,
  onLoaded?: (loaded: number) => void,
  signal?: AbortSignal,
): Promise<BlobUploadResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);

    if (signal) {
      if (signal.aborted) {
        resolve({ success: false, error: 'Upload cancelled.' });
        return;
      }
      signal.addEventListener('abort', () => {
        xhr.abort();
        resolve({ success: false, error: 'Upload cancelled.' });
      });
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onLoaded?.(event.loaded);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ success: true, status: xhr.status });
      } else if (xhr.status === 403) {
        resolve({ success: false, error: 'Upload SAS expired or was rejected. Request a new upload URL and retry.', status: xhr.status });
      } else {
        resolve({
          success: false,
          error: `Upload failed (${xhr.status}). ${xhr.statusText || 'Try again.'}`,
          status: xhr.status,
        });
      }
    };

    xhr.onerror = () => {
      resolve({ success: false, error: 'Network error during upload. Check CORS and storage configuration.' });
    };

    xhr.onabort = () => {
      resolve({ success: false, error: 'Upload cancelled.' });
    };

    xhr.send(body);
  });
}
