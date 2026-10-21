import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import BlueskyPublishCard from './BlueskyPublishCard';
import { Colors, Typography } from '../../constants/DesignSystem';

interface Props {
  visible: boolean;
  issueId: string;
  title: string;
  description: string;
  photoUri?: string;
  onClose: () => void;
}

export default function BlueskyShareModal({
  visible,
  issueId,
  title,
  description,
  photoUri,
  onClose,
}: Props) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      testID="bluesky-share-modal"
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel Bluesky preview"
            onPress={onClose}
            hitSlop={10}
            style={styles.cancelButton}
          >
            <Ionicons name="close" size={24} color={Colors.textMain} />
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.title}>Bluesky post</Text>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BlueskyPublishCard
            issueId={issueId}
            title={title}
            description={description}
            photoUri={photoUri}
          />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  header: {
    minHeight: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderDark,
  },
  cancelButton: { minWidth: 72, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 },
  cancelText: { ...Typography.bodySm, color: Colors.textMain },
  title: { ...Typography.h4, color: Colors.textMain },
  headerSpacer: { width: 72 },
  content: { padding: 16, paddingBottom: 32 },
});