import React from 'react';
import { JsonEditor } from '../components/JsonEditor';

export function EconomySettings() {
  return <JsonEditor titleKey="economy" section="economy" filename="EconomyOverride.json" />;
}