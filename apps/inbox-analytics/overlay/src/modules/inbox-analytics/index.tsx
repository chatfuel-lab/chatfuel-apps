import { lazy } from 'react';
import { IconChat } from '~ui';
import type { ModuleDescriptor } from '../types';

export const moduleDescriptor: ModuleDescriptor = {
  id: 'inbox-analytics',
  title: 'Inbox Analytics',
  icon: <IconChat />,
  Component: lazy(() => import('./InboxAnalyticsApp').then((m) => ({ default: m.InboxAnalyticsApp }))),
};
