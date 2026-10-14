#!/usr/bin/env node
// Builds k8s/observability/grafana-dashboard.yaml (ConfigMap embedding the
// dashboard JSON) from observability/grafana/dashboards/resilience-lab.json.
// Run: node scripts/gen-dashboard-configmap.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = readFileSync(path.join(root, 'observability/grafana/dashboards/resilience-lab.json'), 'utf8');
JSON.parse(json); // fail fast on invalid JSON

// Indent every line under the YAML literal block scalar (2 spaces + 4 for key).
const body = json
  .split(/\r?\n/)
  .map((line) => (line.length ? '    ' + line : ''))
  .join('\n')
  .replace(/[ \t]+$/gm, ''); // strip trailing spaces that break block scalars

const yaml = `# ===========================================================================
# GENERATED FILE — do not edit by hand.
# Source: observability/grafana/dashboards/resilience-lab.json
# Regenerate: node scripts/gen-dashboard-configmap.mjs
# Mounted at /etc/grafana/dashboards/resilience-lab.json by the Grafana
# Deployment (k8s/observability/grafana.yaml). Well under the 1MiB
# ConfigMap limit.
# ===========================================================================
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-dashboard
  namespace: observability
  labels:
    app: grafana
    app.kubernetes.io/part-of: resilience-lab
data:
  resilience-lab.json: |
${body}
`;

writeFileSync(path.join(root, 'k8s/observability/grafana-dashboard.yaml'), yaml);
console.log('wrote k8s/observability/grafana-dashboard.yaml', yaml.length, 'bytes');
