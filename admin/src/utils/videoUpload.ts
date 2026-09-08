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

export function uploadToBlob(
  uploadUrl: string,
  file: File,
  contentType: string,
  onProgress?: (progress: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<BlobUploadResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('x-ms-blob-type', 'BlockBlob');
    xhr.setRequestHeader('Content-Type', contentType);

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
      onProgress?.({
        loaded: event.loaded,
        total: event.total,
        percent: Math.round((event.loaded / event.total) * 100),
      });
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

    xhr.send(file);
  });
}
