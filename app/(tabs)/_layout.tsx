import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors } from '@/lib/theme';

// You can explore the built-in icon families and icons on the web at https://icons.expo.fyi/
function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={24} {...props} />;
}

export default function TabLayout() {
  const { t } = useTranslation('navigation');

  return (
    <Tabs
      screenOptions={{
        sceneStyle: {
          alignSelf: 'center',
          maxWidth: Platform.OS === 'web' ? 520 : undefined,
          width: '100%',
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.subtle,
        tabBarLabelPosition: 'below-icon',
        tabBarStyle: {
          alignSelf: 'center',
          backgroundColor: colors.card,
          borderTopColor: colors.cardBorder,
          height: 72,
          maxWidth: Platform.OS === 'web' ? 520 : undefined,
          paddingBottom: 10,
          paddingTop: 6,
          width: '100%',
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '700',
          lineHeight: 16,
        },
        headerShown: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: t('dashboard'),
          tabBarIcon: ({ color }) => <TabBarIcon name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="circles"
        options={{
          title: t('circles'),
          tabBarIcon: ({ color }) => <TabBarIcon name="users" color={color} />,
        }}
      />
      <Tabs.Screen
        name="create-circle"
        options={{
          title: t('create'),
          tabBarIcon: ({ color }) => <TabBarIcon name="plus-circle" color={color} />,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: t('activity'),
          tabBarIcon: ({ color }) => <TabBarIcon name="list-alt" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('settings'),
          tabBarIcon: ({ color }) => <TabBarIcon name="cog" color={color} />,
        }}
      />
    </Tabs>
  );
}
