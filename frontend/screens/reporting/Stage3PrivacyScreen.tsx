/**
 * Stage 3: Privacy & Sharing Selection
 *
 * Simplified to 2 clear options:
 * 1. Share on X/Twitter — Opens Twitter app with pre-composed tweet
 * 2. App Only — No Twitter posting
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Button from '../../components/ui/Button';
import { TwitterPostingMethod } from '../../types';

interface Props {
  onContinue: (privacyChoice: {
    method: TwitterPostingMethod;
    rememberChoice: boolean;
  }) => void;
  onBack: () => void;
  defaultMethod?: TwitterPostingMethod;
}

export default function Stage3PrivacyScreen({ onContinue, onBack, defaultMethod }: Props) {
  const [selectedMethod, setSelectedMethod] = useState<TwitterPostingMethod>(
    defaultMethod || 'twitter'
  );

  const handleContinue = () => {
    onContinue({
      method: selectedMethod,
      rememberChoice: false,
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>How do you want to share?</Text>
        <Text style={styles.subtitle}>
          Amplify your voice by sharing on X/Twitter, or keep it within the app
        </Text>
      </View>

      {/* Option 1: Share on X/Twitter */}
      <TouchableOpacity
        style={[
          styles.optionCard,
          selectedMethod === 'twitter' && styles.optionCardSelected,
        ]}
        onPress={() => setSelectedMethod('twitter')}
      >
        <View style={styles.optionHeader}>
          <View style={[styles.iconContainer, selectedMethod === 'twitter' && styles.iconContainerSelected]}>
            <Ionicons
              name="logo-twitter"
              size={28}
              color={selectedMethod === 'twitter' ? '#fff' : '#6B7280'}
            />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={styles.titleRow}>
              <Text style={styles.optionTitle}>Share on X/Twitter</Text>
              <View style={styles.recommendedBadge}>
                <Text style={styles.recommendedText}>RECOMMENDED</Text>
              </View>
            </View>
            <Text style={styles.optionSubtitle}>
              Opens Twitter with a pre-composed tweet. You post from your own account.
            </Text>
          </View>
        </View>

        <View style={styles.featureList}>
          <View style={styles.featureRow}>
            <Ionicons name="checkmark-circle" size={20} color="#34D399" />
            <Text style={styles.featureText}>Authorities tagged automatically</Text>
          </View>
          <View style={styles.featureRow}>
            <Ionicons name="checkmark-circle" size={20} color="#34D399" />
            <Text style={styles.featureText}>Location & details included</Text>
          </View>
          <View style={styles.featureRow}>
            <Ionicons name="checkmark-circle" size={20} color="#34D399" />
            <Text style={styles.featureText}>No account linking needed</Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Option 2: App Only */}
      <TouchableOpacity
        style={[
          styles.optionCard,
          selectedMethod === 'none' && styles.optionCardSelected,
        ]}
        onPress={() => setSelectedMethod('none')}
      >
        <View style={styles.optionHeader}>
          <View style={[styles.iconContainer, selectedMethod === 'none' && styles.iconContainerSelected]}>
            <Ionicons
              name="lock-closed"
              size={28}
              color={selectedMethod === 'none' ? '#fff' : '#6B7280'}
            />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.optionTitle}>Private Report</Text>
            <Text style={styles.optionSubtitle}>
              Visible only to you. No external sharing or public-feed publication.
            </Text>
          </View>
        </View>

        <View style={styles.featureList}>
          <View style={styles.featureRow}>
            <Ionicons name="checkmark-circle" size={20} color="#34D399" />
            <Text style={styles.featureText}>Stored as a private report</Text>
          </View>
          <View style={styles.featureRow}>
            <Ionicons name="close-circle" size={20} color="#EF4444" />
            <Text style={styles.featureText}>Authorities NOT auto-notified</Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Info Box */}
      <View style={styles.infoBox}>
        <Ionicons name="information-circle-outline" size={20} color="#2563EB" />
        <Text style={styles.infoText}>
          You can always share to X/Twitter later from the success screen or post detail.
        </Text>
      </View>

      <View style={{ height: 120 }} />

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <Button title="← Back" onPress={onBack} variant="outline" style={{ flex: 1 }} />
        <Button title="Next: Preview" onPress={handleContinue} style={{ flex: 2 }} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#F9FAFB',
    paddingBottom: 120,
  },
  header: {
    marginBottom: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#23272F',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  optionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  optionCardSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainerSelected: {
    backgroundColor: '#2563EB',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#23272F',
  },
  recommendedBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  recommendedText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2563EB',
  },
  optionSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  featureList: {
    marginTop: 12,
    gap: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    fontSize: 14,
    color: '#4B5563',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#DBEAFE',
    borderRadius: 8,
    padding: 12,
    gap: 8,
    marginTop: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#1E40AF',
    lineHeight: 18,
  },
  bottomNav: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
  },
});
