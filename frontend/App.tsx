import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme, Text, StyleSheet } from 'react-native';

// Error Boundary Component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorText}>{String(this.state.error)}</Text>
          <Text style={styles.errorHint}>Check browser console (F12) for details</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

import LoginScreen from './screens/LoginScreen';
import SignupScreen from './screens/SignupScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
import UsernameSelectionScreen from './screens/UsernameSelectionScreen';
import FeedScreen from './screens/FeedScreen';
import PostDetailScreen from './screens/PostDetailScreen';
// Use new 5-stage reporting flow (PRD Section 5.2)
import ReportIssueScreen from './screens/ReportIssueScreenV2';
import ProfileScreen from './screens/ProfileScreen';
import SettingsScreen from './screens/SettingsScreen';
import MyReportsScreen from './screens/MyReportsScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import PolicyScreen from './screens/PolicyScreen';
import DebugScreen from './screens/DebugScreen';
import TermsOfServiceScreen from './screens/TermsOfServiceScreen';
import PrivacyPolicyScreen from './screens/PrivacyPolicyScreen';
import UpdatePasswordScreen from './screens/UpdatePasswordScreen';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Button from './components/ui/Button';

const RootStack = createNativeStackNavigator();
const FeedStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

function FeedNavigator() {
  return (
    <FeedStack.Navigator>
      <FeedStack.Screen name="Feed" component={FeedScreen} />
      <FeedStack.Screen name="PostDetail" component={PostDetailScreen} options={{ title: 'Issue' }} />
    </FeedStack.Navigator>
  );
}

function ProfileNavigator() {
  return (
    <ProfileStack.Navigator>
      <ProfileStack.Screen name="ProfileHome" component={ProfileScreen} options={{ title: 'Profile' }} />
      <ProfileStack.Screen name="MyReports" component={MyReportsScreen} options={{ title: 'My Reports' }} />
      <ProfileStack.Screen name="Settings" component={SettingsScreen} />
      <ProfileStack.Screen name="Notifications" component={NotificationsScreen} />
      <ProfileStack.Screen name="Policy" component={PolicyScreen} options={{ title: 'Policy' }} />
      <ProfileStack.Screen name="TermsOfService" component={TermsOfServiceScreen} options={{ title: 'Terms of Service' }} />
      <ProfileStack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} options={{ title: 'Privacy Policy' }} />
      <ProfileStack.Screen name="Debug" component={DebugScreen} options={{ title: 'Debug' }} />
    </ProfileStack.Navigator>
  );
}

import { Colors, Shadows, Spacing } from './constants/DesignSystem';
import { View, TouchableOpacity, Alert } from 'react-native';

// Custom Center Button (Snapchat/Reddit style)
const CustomTabBarButton = ({ children, onPress }: any) => (
  <TouchableOpacity
    style={{
      top: -20, // Bulge effect
      justifyContent: 'center',
      alignItems: 'center',
      ...Shadows.md,
    }}
    onPress={onPress}
  >
    <View
      style={{
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: Colors.primary, // Civic Blue
        borderWidth: 4,
        borderColor: Colors.surface, // White border to cut visually
      }}
    >
      {children}
    </View>
  </TouchableOpacity>
);

function AppTabs() {
  const { isGuest, signOut } = useAuth();
  const signOutForLogin = async () => {
    const result = await signOut();
    if (result?.error) Alert.alert('Logout failed', result.error);
  };

  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopWidth: 0,
          ...Shadows.lg,
          height: 60,
          position: 'absolute',
          bottom: 20,
          left: 20,
          right: 20,
          borderRadius: 20,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="Home"
        component={FeedNavigator}
        options={{
          tabBarIcon: ({ color }) => <Ionicons name="home" size={28} color={color} />,
        }}
      />

      {/* Center Action Button - Launches Modal */}
      <Tabs.Screen
        name="Report"
        component={View} // Dummy component
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault(); // Prevent switching to this tab
            if (isGuest) {
              Alert.alert('Login Required', 'You need an account to report issues.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign In', onPress: () => void signOutForLogin() },
              ]);
            } else {
              navigation.navigate('ReportModal'); // Open Modal instead
            }
          },
        })}
        options={{
          tabBarIcon: ({ focused }) => <Ionicons name="camera" size={32} color="#fff" />,
          tabBarButton: (props) => <CustomTabBarButton {...props} />,
        }}
      />

      <Tabs.Screen
        name="Profile"
        component={ProfileNavigator}
        options={{
          tabBarIcon: ({ color }) => <Ionicons name="person" size={28} color={color} />,
        }}
      />
    </Tabs.Navigator>
  );
}

export function Root() {
  const {
    session,
    profile,
    isLoading,
    isPasswordRecovery,
    authCallbackError,
    clearAuthCallbackError,
  } = useAuth();
  const scheme = useColorScheme();

  if (authCallbackError) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorTitle}>Authentication link unavailable</Text>
        <Text style={styles.errorText}>{authCallbackError}</Text>
        <Button title="Continue to the app" onPress={clearAuthCallbackError} />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading Civic Vigilance...</Text>
        <Text style={styles.loadingHint}>Initializing backend...</Text>
      </View>
    );
  }

  if (isPasswordRecovery) {
    return (
      <NavigationContainer theme={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <RootStack.Navigator>
          <RootStack.Screen
            name="UpdatePassword"
            component={UpdatePasswordScreen}
            options={{ title: 'Update Password', headerShown: true }}
          />
        </RootStack.Navigator>
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer theme={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {session ? (
          <>
            <RootStack.Screen name="AppTabs" component={AppTabs} />
            <RootStack.Screen
              name="ReportModal"
              component={ReportIssueScreen}
              options={{
                presentation: 'fullScreenModal',
                animation: 'slide_from_bottom',
                gestureEnabled: false
              }}
            />
            {(!profile?.username && !profile?.full_name) && (
              <RootStack.Screen
                name="UsernameSelection"
                component={UsernameSelectionScreen}
                options={{ title: 'Choose Your Voice', headerBackVisible: false, headerShown: true }}
              />
            )}
          </>
        ) : (
          <RootStack.Screen name="Auth" component={AuthNavigator} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

const AuthStack = createNativeStackNavigator();
function AuthNavigator() {
  return (
    <AuthStack.Navigator>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: 'Reset Password' }} />
    </AuthStack.Navigator>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.screenPadding,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.error,
    marginBottom: Spacing.md,
  },
  errorText: {
    fontSize: 14,
    color: Colors.textMain,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  errorHint: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: Spacing.md,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  loadingText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.primary,
    marginBottom: Spacing.sm,
  },
  loadingHint: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
});

export default function App() {
  if (__DEV__) {
    console.log('[App] Starting Civic Vigilance...');
    console.log('[App] Supabase configured:', process.env.EXPO_PUBLIC_SUPABASE_URL ? 'Yes' : 'No');
    console.log('[App] Backend mode:', process.env.EXPO_PUBLIC_BACKEND_MODE);
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </ErrorBoundary>
  );
}
