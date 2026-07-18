import React, { useState } from 'react';
import { Button, SafeAreaView, Text, View } from 'react-native';
import {
  ZennopayProvider,
  useZennopay,
  type PaymentResult,
} from '@zennopay/react-native';

function Checkout(): JSX.Element {
  const { presentSheet } = useZennopay();
  const [status, setStatus] = useState('Ready');

  const pay = async () => {
    setStatus('Presenting…');
    // In a real app, your backend pre-creates the intent and mints this JWT.
    const result: PaymentResult = await presentSheet({
      intentId: 'zp_demo_intent',
      sessionJwt: 'header.payload.signature',
      appearance: { mode: 'automatic' },
      refreshSession: async (intentId) => {
        // Re-mint a fresh JWT for `intentId` from your backend.
        return null;
      },
    });

    switch (result.status) {
      case 'completed':
        setStatus(`Completed: ${result.intentId}`);
        break;
      case 'pending':
        setStatus(`Pending: ${result.intentId}`);
        break;
      case 'failed':
        setStatus(`Failed: ${result.error.code}`);
        break;
      case 'canceled':
        setStatus('Canceled');
        break;
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ marginBottom: 16 }}>{status}</Text>
      <Button title="Pay with Zennopay" onPress={pay} />
    </View>
  );
}

export default function App(): JSX.Element {
  return (
    <ZennopayProvider config={{ environment: 'sandbox' }}>
      <SafeAreaView style={{ flex: 1 }}>
        <Checkout />
      </SafeAreaView>
    </ZennopayProvider>
  );
}
