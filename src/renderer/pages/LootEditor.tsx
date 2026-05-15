import React from 'react';
import { JsonEditor } from '../components/JsonEditor';

export function LootEditor() {
  return <JsonEditor titleKey="loot" section="loot" filename="LootOverride.json" rows={25} />;
}