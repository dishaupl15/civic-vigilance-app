/**
 * Stage 1: Photo Capture with GPS Overlay
 * PRD Section 5.2 - Stage 1: Photo Capture
 *
 * Features:
 * - Live GPS overlay with full address
 * - Flash and camera flip controls
 * - Multi-capture support (up to 3 photos)
 * - Retake option
 * - Gallery import option
 */

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Alert,
  Image,
  ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { useLiveLocation } from '../../hooks/useLiveLocation';
import Button from '../../components/ui/Button';
import { Colors, Shadows, BorderRadius, Layout } from '../../constants/DesignSystem';

interface Props {
  onContinue: (
    photos: string[],
    coords: { lat: number; lng: number } | null,
    address: string,
    accuracy?: number
  ) => void;
  onCancel?: () => void;
}

export default function Stage1CameraScreen({ onContinue, onCancel }: Props) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [facing, setFacing] = useState<'back' | 'front'>(Platform.OS === 'web' ? 'front' : 'back');
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const [cameraReady, setCameraReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);
  const {
    coords,
    address,
    accuracy,
    permissionStatus,
    canAskAgain,
    loading: locationLoading,
    error: locationError,
    requestLocation,
    openLocationSettings,
  } = useLiveLocation();
  const permissionBlocked = permissionStatus === 'denied' && !canAskAgain;

  const ensureCameraPermission = async () => {
    if (camPermission?.granted) return true;

    if (Platform.OS === 'web') {
      const browser = globalThis as any;
      if (!browser.isSecureContext) {
        setCameraError('Camera access requires HTTPS or localhost.');
        return false;
      }
      if (!browser.navigator?.mediaDevices?.getUserMedia) {
        setCameraError('This browser does not support camera access. Try Chrome, Edge, or the gallery option.');
        return false;
      }
    }

    try {
      setCameraError(null);
      const permission = await requestCamPermission();
      if (!permission.granted) {
        setCameraError(
          permission.canAskAgain
            ? 'Camera permission was not granted. Please try again.'
            : 'Camera permission is blocked. Enable it in your browser or device settings.'
        );
        return false;
      }
      return true;
    } catch (error: any) {
      setCameraError(error?.message || 'Unable to request camera permission.');
      return false;
    }
  };

  const takeLivePhoto = async () => {
    // Check if we already have 3 photos (max per PRD)
    if (photos.length >= 3) {
      Alert.alert('Maximum Photos', 'You can add up to 3 photos per report.');
      return;
    }

    if (isCapturing || !(await ensureCameraPermission())) {
      Alert.alert('Camera Permission', 'Camera access is needed to capture photo evidence.');
      return;
    }

    try {
      setIsCapturing(true);
      // `onCameraReady` is not consistently emitted by every browser. Wait for the
      // actual capture method instead of permanently blocking a working web camera.
      for (let attempt = 0; attempt < 20 && typeof cameraRef.current?.takePictureAsync !== 'function'; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (typeof cameraRef.current?.takePictureAsync !== 'function') {
        throw new Error('Camera is still initializing. Wait a moment or choose a photo from Gallery.');
      }
      setCameraReady(true);

      const res = await cameraRef.current.takePictureAsync({
        quality: 0.8,
      });

      if (res?.uri) {
        setPhotos((current) => current.includes(res.uri) ? current : [...current, res.uri].slice(0, 3));
      }
    } catch (e: any) {
      console.error('[Camera] Error taking photo:', e);
      Alert.alert('Capture Failed', `Could not take photo: ${e.message || 'Unknown error'}`);
    } finally {
      setIsCapturing(false);
    }
  };

  const pickFromGallery = async () => {
    if (photos.length >= 3) {
      Alert.alert('Maximum Photos', 'You can add up to 3 photos per report.');
      return;
    }

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Gallery Permission', 'Gallery access is required to select photo evidence.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.92,  // High quality for evidence
        allowsEditing: true,
        allowsMultipleSelection: false,
      });

      if (!result.canceled && result.assets[0]) {
        // Use current location, not EXIF data (PRD requirement)
        const uri = result.assets[0].uri;
        setPhotos((current) => current.includes(uri) ? current : [...current, uri].slice(0, 3));
      }
    } catch (e) {
      console.error('[Camera] Error picking from gallery:', e);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const handleContinue = () => {
    if (photos.length === 0) {
      Alert.alert('Photo Required', 'Please capture at least one photo to continue.');
      return;
    }

    onContinue(photos, coords ? { lat: coords.lat, lng: coords.lng } : null, address, accuracy);
  };

  return (
    <View style={{ flex: 1 }}>
      {/* GPS Overlay Header - PRD 5.2 Stage 1 */}
      <View style={styles.headerOverlay}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>📍 REPORT LOCATION</Text>

          <View style={styles.locationBadge}>
            {address ? (
              <Text style={styles.headerAddress} numberOfLines={2}>
                {address}
              </Text>
            ) : (
              <Text style={styles.headerAddress}>Location not requested</Text>
            )}
          </View>

          <View style={styles.coordsRow}>
            {coords && (
              <Text style={styles.headerCoords}>
                {Math.abs(coords.lat).toFixed(5)}°{coords.lat < 0 ? 'S' : 'N'}, {Math.abs(coords.lng).toFixed(5)}°{coords.lng < 0 ? 'W' : 'E'}
              </Text>
            )}
            {accuracy !== undefined && (
              <View style={[styles.accuracyBadge, accuracy > 100 ? styles.accuracyPoor : styles.accuracyGood]}>
                <Text style={styles.accuracyText}>±{Math.round(accuracy)}m</Text>
              </View>
            )}
          </View>

          {accuracy !== undefined && accuracy > 100 && (
            <View style={styles.warningContainer}>
              <Ionicons name="warning" size={12} color="#FCD34D" />
              <Text style={styles.warningText}> Poor Signal</Text>
            </View>
          )}
          <Pressable
            onPress={() => void (permissionBlocked ? openLocationSettings() : requestLocation())}
            disabled={locationLoading}
            style={styles.locationAction}
            accessibilityRole="button"
          >
            <Text style={styles.locationActionText}>
              {locationLoading ? 'Locating...' : permissionBlocked ? 'Open location settings' : coords ? 'Refresh location' : 'Use current location'}
            </Text>
          </Pressable>
          <Text style={styles.locationPrivacyNote}>Used only for this report. You can enter the address manually.</Text>
          {!!locationError && <Text style={styles.warningText}>{locationError}</Text>}
        </View>
      </View>

      {/* Camera View */}
      {camPermission?.granted && !cameraError ? (
        <CameraView
          ref={cameraRef}
          style={{ flex: 1 }}
          facing={facing}
          flash={Platform.OS === 'web' ? 'off' : flash}
          onCameraReady={() => setCameraReady(true)}
          onMountError={({ message }) => {
            setCameraReady(false);
            setCameraError(message || 'The camera could not be started.');
          }}
        />
      ) : (
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={64} color="#6B7280" />
          <Text style={styles.permissionText}>
            {cameraError ? 'Camera unavailable' : 'Camera access needed'}
          </Text>
          <Text style={styles.permissionSubtext}>
            {cameraError || 'We need camera access to capture photo evidence'}
          </Text>
          <Button title="Enable Camera" onPress={ensureCameraPermission} />
        </View>
      )}

      {/* Photo Thumbnails (if any) */}
      {camPermission?.granted && !cameraReady && !cameraError && (
        <View style={styles.cameraStatus} pointerEvents="none">
          <Text style={styles.cameraStatusText}>Starting camera…</Text>
        </View>
      )}
      {photos.length > 0 && (
        <View style={styles.thumbnailContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {photos.map((photo, index) => (
              <View key={index} style={styles.thumbnailWrapper}>
                <Image source={{ uri: photo }} style={styles.thumbnail} />
                <Pressable
                  style={styles.removeButton}
                  onPress={() => removePhoto(index)}
                >
                  <Ionicons name="close-circle" size={24} color="#EF4444" />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Camera Controls */}
      <View style={styles.shutterRow}>
        {Platform.OS === 'web' ? (
          <View style={styles.smallBtnPlaceholder} />
        ) : (
          <Pressable
            onPress={() => setFlash((p) => (p === 'off' ? 'on' : 'off'))}
            style={styles.smallBtn}
            accessibilityLabel="Toggle flash"
          >
            <Ionicons name={flash === 'off' ? 'flash-off' : 'flash'} size={22} color="#fff" />
          </Pressable>
        )}

        <Pressable
          onPress={takeLivePhoto}
          disabled={isCapturing || photos.length >= 3}
          style={[styles.shutter, isCapturing && { opacity: 0.5 }]}
          accessibilityLabel="Capture photo"
        >
          <Ionicons name="camera" size={34} color="#111" />
          {photos.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{photos.length}</Text>
            </View>
          )}
        </Pressable>

        <Pressable
          onPress={() => {
            setCameraReady(false);
            setCameraError(null);
            setFacing((p) => (p === 'back' ? 'front' : 'back'));
          }}
          style={styles.smallBtn}
          accessibilityLabel="Flip camera"
        >
          <Ionicons name="camera-reverse-outline" size={24} color="#fff" />
        </Pressable>
      </View>

      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        <Button
          title="📷 Gallery"
          onPress={pickFromGallery}
          variant="outline"
          style={{ flex: 1 }}
        />
        <Button
          title={`Continue (${photos.length}/3)`}
          onPress={handleContinue}
          style={{ flex: 2 }}
          disabled={photos.length === 0}
        />
      </View>

      {Platform.OS !== 'web' && !Constants.isDevice && (
        <Text style={styles.simHint}>Camera availability depends on the simulator. Use Gallery if unavailable.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerOverlay: {
    ...Layout.glassCard,
    position: 'absolute',
    top: 50, // Safe Area fallback
    left: 16,
    right: 16,
    zIndex: 10,
    backgroundColor: Colors.glassDark, // Elegant Charcoal with opacity
  },
  headerContent: {
    padding: 16,
  },
  headerTitle: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  locationBadge: {
    marginBottom: 8,
  },
  headerAddress: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  coordsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerCoords: {
    color: '#D1D5DB', // Gray-300
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontWeight: '500',
  },
  accuracyBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  accuracyGood: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)', // Green-500
    borderColor: 'rgba(16, 185, 129, 0.5)',
  },
  accuracyPoor: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)', // Amber-500
    borderColor: 'rgba(245, 158, 11, 0.5)',
  },
  accuracyText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  warningText: {
    color: '#FCD34D',
    fontSize: 12,
    marginLeft: 4,
    fontWeight: '500',
  },
  locationAction: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: Colors.primary,
  },
  locationActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  locationPrivacyNote: {
    color: '#D1D5DB',
    fontSize: 11,
    marginTop: 6,
  },
  cameraStatus: {
    position: 'absolute',
    top: 170,
    alignSelf: 'center',
    zIndex: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cameraStatusText: {
    color: '#FFFFFF',
    fontSize: 13,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  permissionText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#E5E7EB',
    marginTop: 16,
  },
  permissionSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  thumbnailContainer: {
    position: 'absolute',
    top: 140,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
  },
  thumbnailWrapper: {
    marginRight: 12,
    position: 'relative',
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#fff',
  },
  removeButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  shutterRow: {
    position: 'absolute',
    bottom: 110,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  shutter: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.surface,
    borderWidth: 6,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...Shadows.md,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: Colors.primary,
    width: 24,
    height: 24,
    borderRadius: BorderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: Colors.textInverse,
    fontSize: 12,
    fontWeight: '700',
  },
  smallBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtnPlaceholder: {
    width: 46,
    height: 46,
  },
  bottomActions: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    flexDirection: 'row',
    gap: 12,
  },
  simHint: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    color: '#888',
    fontSize: 12,
  },
});
