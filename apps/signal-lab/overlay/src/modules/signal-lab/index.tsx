import { lazy } from 'react';
import { IconLayoutGrid } from '~ui';
import type { ModuleDescriptor } from '../types';

export const moduleDescriptor: ModuleDescriptor = {
  id: 'signal-lab', title: 'Signal Lab', icon: <IconLayoutGrid />,
  Component: lazy(() => import('./signal-lab-app').then(module => ({ default: module.SignalLabApp }))),
};
