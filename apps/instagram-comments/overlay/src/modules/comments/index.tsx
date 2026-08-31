import { lazy } from 'react';
import { IconInstagram } from '~ui';
import type { ModuleDescriptor } from '../types';

export const moduleDescriptor: ModuleDescriptor = {
  id: 'comments',
  title: 'Comment rules',
  icon: <IconInstagram />,
  Component: lazy(() => import('./CommentsApp').then((m) => ({ default: m.CommentsApp }))),
};
