import React, { useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Button from '../../components/ui/Button';
import CategoryPicker, { CategoryKey } from '../../components/CategoryPicker';
import { BorderRadius, Colors, Shadows, Typography } from '../../constants/DesignSystem';
import { parseOptionalCoordinates } from '../../lib/reportValidation';

interface Props {
  photos: string[];
  initialAddress: string;
  coords: { lat: number; lng: number } | null;
  accuracy?: number;
  onContinue: (data: {
    title: string;
    category: CategoryKey;
    description: string;
    address: string;
    coords: { lat: number; lng: number } | null;
    locationSource: 'gps' | 'manual';
    locationConfirmed: true;
  }) => void;
  onBack: () => void;
}

export default function Stage2DetailsScreen({ photos, initialAddress, coords, accuracy, onContinue, onBack }: Props) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<CategoryKey>('pothole');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState(initialAddress);
  const [editingLocation, setEditingLocation] = useState(!initialAddress);
  const [latitude, setLatitude] = useState(coords ? String(coords.lat) : '');
  const [longitude, setLongitude] = useState(coords ? String(coords.lng) : '');

  const handleContinue = () => {
    if (!title.trim()) return Alert.alert('Title Required', 'Please enter a short factual title.');
    if (!description.trim()) return Alert.alert('Description Required', 'Describe the visible civic issue.');
    if (!address.trim()) return Alert.alert('Location Required', 'Confirm the detected address or enter it manually.');

    const parsed = parseOptionalCoordinates(latitude, longitude);
    if (parsed.error) return Alert.alert('Invalid Coordinates', parsed.error);
    const confirmedCoords = parsed.coordinates;
    const unchangedGps = !!coords && confirmedCoords?.lat === coords.lat && confirmedCoords?.lng === coords.lng;
    onContinue({
      title: title.trim(),
      category,
      description: description.trim(),
      address: address.trim(),
      coords: confirmedCoords,
      locationSource: unchangedGps ? 'gps' : 'manual',
      locationConfirmed: true,
    });
  };

  const suggestTitle = () => {
    const place = address.split(',')[0]?.trim() || 'confirmed location';
    const labels: Record<CategoryKey, string> = {
      pothole: 'Pothole', garbage: 'Garbage issue', streetlight: 'Streetlight issue', drainage: 'Drainage issue',
      water_supply: 'Water supply issue', sewage: 'Sewage issue', traffic_signal: 'Traffic signal issue',
      encroachment: 'Possible encroachment', stray_animals: 'Stray animal issue', parks: 'Park maintenance issue', other: 'Civic issue',
    };
    setTitle(`${labels[category]} near ${place}`.slice(0, 80));
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoSection}>
          {photos.map((photo) => <Image key={photo} source={{ uri: photo }} style={styles.photoPreview} resizeMode="cover" />)}
        </ScrollView>

        <View style={styles.card}>
          <View style={styles.cardHeader}><Text style={styles.sectionTitle}>Title</Text><Text style={styles.charCount}>{title.length}/80</Text></View>
          <TextInput style={styles.input} placeholder="Short factual title" value={title} onChangeText={setTitle} maxLength={80} />
          <Pressable onPress={suggestTitle}><Text style={styles.link}>Suggest from category and location</Text></Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Category</Text>
          <CategoryPicker value={category} onChange={setCategory} />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}><Text style={styles.sectionTitle}>Visible details</Text><Text style={styles.charCount}>{description.length}/500</Text></View>
          <TextInput style={[styles.input, styles.textArea]} placeholder="Describe only what you observed" value={description} onChangeText={setDescription} maxLength={500} multiline />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.sectionTitle}>Location confirmation</Text>
            <Pressable onPress={() => setEditingLocation((value) => !value)}><Text style={styles.link}>{editingLocation ? 'Done' : 'Edit'}</Text></Pressable>
          </View>
          {editingLocation ? (
            <>
              <TextInput style={[styles.input, styles.textAreaSmall]} value={address} onChangeText={setAddress} multiline placeholder="Street, landmark, city and state" />
              <View style={styles.coordinateRow}>
                <TextInput style={[styles.input, styles.coordinateInput]} value={latitude} onChangeText={setLatitude} keyboardType="numbers-and-punctuation" placeholder="Latitude (optional)" />
                <TextInput style={[styles.input, styles.coordinateInput]} value={longitude} onChangeText={setLongitude} keyboardType="numbers-and-punctuation" placeholder="Longitude (optional)" />
              </View>
            </>
          ) : <Text style={styles.address}>{address}</Text>}
          <Text style={styles.meta}>{coords ? `GPS detected${accuracy ? `, accuracy ±${Math.round(accuracy)}m` : ''}` : 'GPS unavailable; this address will be marked as manually confirmed'}</Text>
          <Pressable disabled={!coords} style={[styles.mapLink, !coords && { opacity: 0.45 }]} onPress={() => coords && Linking.openURL(`https://maps.google.com/?q=${coords.lat},${coords.lng}`)}>
            <Ionicons name="map-outline" size={16} color={Colors.primary} />
            <Text style={styles.link}>{coords ? 'Review detected pin on map' : 'No detected map pin'}</Text>
          </Pressable>
        </View>
        <View style={{ height: 110 }} />
      </ScrollView>
      <View style={styles.bottomNav}>
        <Button title="Edit Photos" onPress={onBack} variant="outline" style={{ flex: 1 }} />
        <Button title="Confirm & Continue" onPress={handleContinue} style={{ flex: 2 }} disabled={!title.trim() || !description.trim() || !address.trim()} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 120, backgroundColor: Colors.background },
  photoSection: { marginBottom: 16 },
  photoPreview: { width: 120, height: 120, borderRadius: BorderRadius.md, marginRight: 12 },
  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: 16, marginBottom: 16, ...Shadows.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { ...Typography.h4, marginBottom: 8 },
  charCount: { fontSize: 12, color: Colors.textMuted },
  input: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.sm, padding: 12, fontSize: 15, color: Colors.textMain },
  textArea: { height: 110, textAlignVertical: 'top' },
  textAreaSmall: { minHeight: 70, textAlignVertical: 'top', marginBottom: 8 },
  link: { marginTop: 8, fontSize: 14, color: Colors.primary, fontWeight: '600' },
  address: { fontSize: 15, color: Colors.textMain, fontWeight: '600' },
  meta: { marginTop: 8, fontSize: 12, color: Colors.textSecondary },
  coordinateRow: { flexDirection: 'row', gap: 8 },
  coordinateInput: { flex: 1, fontSize: 13 },
  mapLink: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  bottomNav: { position: 'absolute', left: 16, right: 16, bottom: 24, flexDirection: 'row', gap: 12, backgroundColor: Colors.surface, padding: 12, borderRadius: BorderRadius.md, ...Shadows.lg },
});
