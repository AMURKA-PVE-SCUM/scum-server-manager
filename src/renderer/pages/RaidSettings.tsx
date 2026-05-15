import React from 'react';
import { JsonEditor } from '../components/JsonEditor';

export function RaidSettings() {
  return <JsonEditor titleKey="raid" section="raid" filename="RaidTimes.json" />;
}