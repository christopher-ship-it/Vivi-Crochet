import { useMemo } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { colors, fonts, spacing } from '../theme';

export interface RazorpayCheckoutPayload {
  keyId: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  name: string;
  description: string;
  prefillName?: string;
  prefillEmail?: string;
  prefillContact?: string;
}

export interface RazorpaySuccessPayload {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayCheckoutModalProps {
  visible: boolean;
  payload: RazorpayCheckoutPayload | null;
  onSuccess: (result: RazorpaySuccessPayload) => void;
  onDismiss: () => void;
  onError: (message: string) => void;
}

function buildCheckoutHtml(payload: RazorpayCheckoutPayload): string {
  const options = {
    key: payload.keyId,
    amount: payload.amountPaise,
    currency: payload.currency,
    name: payload.name,
    description: payload.description,
    order_id: payload.orderId,
    prefill: {
      name: payload.prefillName ?? '',
      email: payload.prefillEmail ?? '',
      contact: payload.prefillContact ?? '',
    },
    theme: { color: '#e8215b' },
  };

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; margin: 0; padding: 24px; background: #fffaf9; color: #120e10; }
    .box { border: 2px solid #120e10; padding: 20px; background: #fff; }
    h1 { font-size: 18px; margin: 0 0 8px; }
    p { font-size: 14px; color: #7a6d72; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Secure checkout</h1>
    <p>Opening Razorpay… If nothing appears, tap Retry below.</p>
    <button id="retry" style="margin-top:16px;background:#e8215b;color:#fff;border:2px solid #120e10;padding:12px 18px;font-weight:700;">Retry payment</button>
  </div>
  <script>
    var options = ${JSON.stringify(options)};
    options.handler = function (response) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'success', payload: response }));
    };
    options.modal = {
      ondismiss: function () {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'dismiss' }));
      }
    };
    function openCheckout() {
      try {
        var rzp = new Razorpay(options);
        rzp.on('payment.failed', function (response) {
          var msg = (response && response.error && response.error.description) || 'Payment failed';
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: msg }));
        });
        rzp.open();
      } catch (e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(e) }));
      }
    }
    document.getElementById('retry').addEventListener('click', openCheckout);
    openCheckout();
  </script>
</body>
</html>`;
}

export function RazorpayCheckoutModal({
  visible,
  payload,
  onSuccess,
  onDismiss,
  onError,
}: RazorpayCheckoutModalProps) {
  const html = useMemo(
    () => (payload ? buildCheckoutHtml(payload) : ''),
    [payload],
  );

  function handleMessage(event: WebViewMessageEvent) {
    try {
      const data = JSON.parse(event.nativeEvent.data) as {
        type: string;
        payload?: RazorpaySuccessPayload;
        message?: string;
      };
      if (data.type === 'success' && data.payload) {
        onSuccess(data.payload);
        return;
      }
      if (data.type === 'dismiss') {
        onDismiss();
        return;
      }
      if (data.type === 'error') {
        onError(data.message ?? 'Payment failed.');
      }
    } catch {
      onError('Could not read payment result.');
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onDismiss}>
      <View style={styles.wrap}>
        <View style={styles.header}>
          <Text style={styles.title}>Pay securely</Text>
          <Pressable onPress={onDismiss} hitSlop={12}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>
        {payload ? (
          <WebView
            originWhitelist={['*']}
            source={{ html }}
            onMessage={handleMessage}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.pink} size="large" />
                <Text style={styles.loadingText}>Loading Razorpay…</Text>
              </View>
            )}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    color: colors.ink,
  },
  close: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.pink,
  },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cream,
    gap: 12,
  },
  loadingText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
  },
});
