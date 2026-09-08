import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AnimatedSplash } from '../src/components/AnimatedSplash';
import { wakeApi } from '../src/utils/wakeApi';

export default function SplashRoute() {
  const router = useRouter();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    wakeApi();
  }, []);

  const handleFinish = useCallback(() => {
    setShowSplash(false);
    router.replace('/(tabs)');
  }, [router]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      {showSplash && <AnimatedSplash onFinish={handleFinish} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
});
