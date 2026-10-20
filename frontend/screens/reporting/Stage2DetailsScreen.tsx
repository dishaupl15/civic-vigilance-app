import React, { useEffect, useState } from 'react';
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
import {
  normalizeReportAddress,
  parseOptionalCoordinates,
  validateReportAddress,
} from '../../lib/reportValidation';
import {
  AuthorityRecommendations,
  emptyAuthorityRecommendations,
  getAuthorityRecommendations,
} from '../../lib/authorityRecommendations';
import { MatchedAuthority } from '../../lib/smartAuthorities';
import { GeneratedReportContent } from '../../lib/reportContentSchema';
import ReportAiAssistance from '../../components/reporting/ReportAiAssistance';

interface Props {
  photos: string[];
  initialAddress: string;
  coords: { lat: number; lng: number } | null;
  accuracy?: number;
  onGeneratedReportContent: (content: GeneratedReportContent) => void;
  onContinue: (data: {
    title: string;
    category: CategoryKey;
    description: string;
    address: string;
    coords: { lat: number; lng: number } | null;
    locationAccuracy?: number;
    locationSource: 'gps' | 'manual';
    locationConfirmed: true;
    selectedAuthorityHandles: string[];
    authoritySuggestions: MatchedAuthority[];
  }) => void;
  onBack: () => void;
}

export default function Stage2DetailsScreen({
  photos,
  initialAddress,
  coords,
  accuracy,
  onGeneratedReportContent,
  onContinue,
  onBack,
}: Props) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<CategoryKey>('pothole');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState(initialAddress);
  const [editingLocation, setEditingLocation] = useState(!initialAddress);
  const [latitude, setLatitude] = useState(coords ? String(coords.lat) : '');
  const [longitude, setLongitude] = useState(coords ? String(coords.lng) : '');
  const parsedCoordinates = parseOptionalCoordinates(latitude, longitude);
  const currentCoords = parsedCoordinates.coordinates;
  const [selectedAuthorityHandles, setSelectedAuthorityHandles] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<AuthorityRecommendations>(() => emptyAuthorityRecommendations(category));
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationsError, setRecommendationsError] = useState<string | null>(null);
  const [recommendationRetry, setRecommendationRetry] = useState(0);
  const [recommendationsContext, setRecommendationsContext] = useState<string | null>(null);
  const currentRecommendationContext = JSON.stringify([
    currentCoords?.lat ?? null,
    currentCoords?.lng ?? null,
    address,
    category,
  ]);

  useEffect(() => {
    let active = true;
    const requestContext = currentRecommendationContext;
    setRecommendationsLoading(true);
    setRecommendationsError(null);
    setRecommendations(emptyAuthorityRecommendations(category));
    setRecommendationsContext(null);
    setSelectedAuthorityHandles([]);
    const timer = setTimeout(() => {
      void getAuthorityRecommendations(currentCoords?.lat, currentCoords?.lng, address, category)
        .then((result) => {
          if (active) {
            setRecommendations(result);
            setRecommendationsContext(requestContext);
          }
        })
        .catch((cause) => {
          if (!active) return;
          setRecommendations(emptyAuthorityRecommendations(category));
          setRecommendationsContext(requestContext);
          setRecommendationsError(cause instanceof Error
            ? cause.message
            : 'Could not load verified account suggestions.');
        })
        .finally(() => {
          if (active) setRecommendationsLoading(false);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [currentCoords?.lat, currentCoords?.lng, address, category, currentRecommendationContext, recommendationRetry]);

  useEffect(() => {
    const availableHandles = new Set(recommendations.accounts.map((authority) => authority.handle));
    setSelectedAuthorityHandles((current) => current.filter((handle) => availableHandles.has(handle)));
  }, [recommendations.accounts]);
  const gpsCoordinatesUnchanged = !!coords
    && currentCoords?.lat === coords.lat
    && currentCoords?.lng === coords.lng;

  const handleContinue = () => {
    const normalizedTitle = title.trim();
    const normalizedAddress = normalizeReportAddress(address);
    if (normalizedTitle.length < 10 || normalizedTitle.length > 100) {
      return Alert.alert('Title Length', 'Enter a factual title between 10 and 100 characters.');
    }
    if (!description.trim()) return Alert.alert('Description Required', 'Describe the visible civic issue.');
    const addressError = validateReportAddress(normalizedAddress);
    if (addressError) return Alert.alert('Location Required', addressError);

    if (parsedCoordinates.error) return Alert.alert('Invalid Coordinates', parsedCoordinates.error);
    const availableAuthorities = recommendationsContext === currentRecommendationContext
      ? recommendations.accounts
      : [];
    onContinue({
      title: normalizedTitle,
      category,
      description: description.trim(),
      address: normalizedAddress,
      coords: currentCoords,
      locationAccuracy: gpsCoordinatesUnchanged ? accuracy : undefined,
      locationSource: gpsCoordinatesUnchanged ? 'gps' : 'manual',
      locationConfirmed: true,
      selectedAuthorityHandles: selectedAuthorityHandles.filter((handle) =>
        availableAuthorities.some((authority) => authority.handle === handle)
      ),
      authoritySuggestions: availableAuthorities,
    });
  };

  const suggestTitle = () => {
    const place = address.split(',')[0]?.trim() || 'confirmed location';
    const labels: Record<CategoryKey, string> = {
      pothole: 'Pothole', garbage: 'Garbage issue', streetlight: 'Streetlight issue', drainage: 'Drainage issue',
      water_supply: 'Water supply issue', sewage: 'Sewage issue', traffic_signal: 'Traffic signal issue',
      encroachment: 'Possible encroachment', stray_animals: 'Stray animal issue', parks: 'Park maintenance issue', other: 'Civic issue',
    };
    setTitle(`${labels[category]} near ${place}`.slice(0, 100));
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoSection}>
          {photos.map((photo) => <Image key={photo} source={{ uri: photo }} style={styles.photoPreview} resizeMode="cover" />)}
        </ScrollView>

        <View style={styles.card}>
          <View style={styles.cardHeader}><Text style={styles.sectionTitle}>Title</Text><Text style={styles.charCount}>{title.trim().length}/100</Text></View>
          <TextInput style={styles.input} placeholder="Short factual title (10–100 characters)" value={title} onChangeText={setTitle} maxLength={100} />
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

        <ReportAiAssistance
          title={title}
          category={category}
          description={description}
          onGenerated={onGeneratedReportContent}
          onUseTitle={setTitle}
          onUseDescription={setDescription}
          onUseCategory={setCategory}
        />

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.sectionTitle}>Location confirmation</Text>
            <Pressable onPress={() => setEditingLocation((value) => !value)}><Text style={styles.link}>{editingLocation ? 'Done' : 'Edit'}</Text></Pressable>
          </View>
          {editingLocation ? (
            <>
              <TextInput style={[styles.input, styles.textAreaSmall]} value={address} onChangeText={setAddress} multiline maxLength={300} placeholder="Street, landmark, city and state" />
              <View style={styles.coordinateRow}>
                <TextInput style={[styles.input, styles.coordinateInput]} value={latitude} onChangeText={setLatitude} keyboardType="numbers-and-punctuation" placeholder="Latitude (optional)" />
                <TextInput style={[styles.input, styles.coordinateInput]} value={longitude} onChangeText={setLongitude} keyboardType="numbers-and-punctuation" placeholder="Longitude (optional)" />
              </View>
            </>
          ) : <Text style={styles.address}>{address}</Text>}
          <Text style={styles.meta}>
            {!currentCoords
              ? 'No GPS coordinates; this address is manually confirmed'
              : !gpsCoordinatesUnchanged
                ? 'Coordinates entered manually'
                : accuracy !== undefined
                  ? `GPS coordinates, accuracy ±${Math.round(accuracy)}m`
                  : 'GPS coordinates; accuracy unavailable'}
          </Text>
          <Pressable
            disabled={!currentCoords}
            style={[styles.mapLink, !currentCoords && { opacity: 0.45 }]}
            onPress={() => {
              if (currentCoords) {
                void Linking.openURL(`https://maps.google.com/?q=${currentCoords.lat},${currentCoords.lng}`)
                  .catch(() => Alert.alert('Map Unavailable', 'Could not open the map. You can still submit the confirmed location.'));
              }
            }}
          >
            <Ionicons name="map-outline" size={16} color={Colors.primary} />
            <Text style={styles.link}>
              {currentCoords ? 'Review report pin on map' : 'No map pin available'}
            </Text>
          </Pressable>
        </View>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Authority account suggestions</Text>
          <Text style={styles.meta}>
            Optional suggestions only. Confirm any account on its official website.
            Civic Vigilance does not contact or notify them. Selected handles are only included in the X draft if you choose external sharing.
          </Text>
          {recommendationsLoading && <Text style={styles.meta}>Checking the verified authority directory…</Text>}
          {!!recommendationsError && (
            <View>
              <Text accessibilityRole="alert" style={styles.meta}>{recommendationsError}</Text>
              <Pressable onPress={() => setRecommendationRetry((attempt) => attempt + 1)}>
                <Text style={styles.link}>Retry account lookup</Text>
              </Pressable>
            </View>
          )}
          {recommendations.accounts.map((authority) => {
            const selected = selectedAuthorityHandles.includes(authority.handle);
            const sourceUrl = authority.sourceUrl;
            return (
              <View key={authority.handle} style={styles.authoritySuggestion}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityLabel={`Select ${authority.name} account ${authority.handle}`}
                  accessibilityState={{ checked: selected }}
                  onPress={() => setSelectedAuthorityHandles((current) => selected
                    ? current.filter((handle) => handle !== authority.handle)
                    : [...current, authority.handle])}
                  style={styles.authoritySelection}
                >
                  <Text style={styles.authorityCheckbox}>{selected ? '☑' : '□'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.address}>{authority.name} ({authority.handle})</Text>
                    <Text style={styles.meta}>
                      Verified directory entry{authority.lastVerifiedAt ? ` · checked ${new Date(authority.lastVerifiedAt).toLocaleDateString()}` : ''} · {authority.matchReason}
                    </Text>
                  </View>
                </Pressable>
                {authority.profileUrl && (
                  <View style={styles.authoritySource}>
                    <Text
                      accessibilityRole="link"
                      style={styles.link}
                      onPress={() => {
                        void Linking.openURL(authority.profileUrl!).catch(() =>
                          Alert.alert('Profile Unavailable', 'Could not open the listed account profile.')
                        );
                      }}
                    >
                      Open listed account profile
                    </Text>
                  </View>
                )}
                {sourceUrl && (
                  <View style={styles.authoritySource}>
                    <Text
                      accessibilityRole="link"
                      style={styles.link}
                      onPress={() => {
                        void Linking.openURL(sourceUrl).catch(() =>
                          Alert.alert('Website Unavailable', 'Could not open the listed source website.')
                        );
                      }}
                    >
                      Listed source website (not independently verified)
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
          {recommendations.accounts.length === 0 && (
            <Text style={styles.meta}>
              {recommendations.unverifiedDirectoryMatches
                ? 'Possible local directory matches could not be independently verified, so specific accounts are withheld.'
                : 'No verified account match is available. No account identity has been inferred.'}
            </Text>
          )}
          <Text style={styles.fieldLabel}>Department-level ideas (general guidance, not verified contacts)</Text>
          {recommendations.departments.map((department) => (
            <Text key={department} style={styles.meta}>• {department}</Text>
          ))}
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
  authoritySuggestion: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  authoritySelection: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  authoritySource: { paddingLeft: 30 },
  authorityCheckbox: { color: Colors.primary, fontSize: 20 },
  fieldLabel: { color: Colors.textMain, fontWeight: '600', marginTop: 12, marginBottom: 4 },
  coordinateRow: { flexDirection: 'row', gap: 8 },
  coordinateInput: { flex: 1, fontSize: 13 },
  mapLink: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  bottomNav: { position: 'absolute', left: 16, right: 16, bottom: 24, flexDirection: 'row', gap: 12, backgroundColor: Colors.surface, padding: 12, borderRadius: BorderRadius.md, ...Shadows.lg },
});
