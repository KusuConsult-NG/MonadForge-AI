const { zodToJsonSchema } = require('zod-to-json-schema');
const fs = require('fs');
const path = require('path');

const schemasDir = path.resolve(__dirname, '../schemas');
if (!fs.existsSync(schemasDir)) {
  fs.mkdirSync(schemasDir, { recursive: true });
}

// Load compiled Zod schemas
let sdkSchemas;
try {
  sdkSchemas = require('../sdk/dist/schemas.js');
} catch (e) {
  console.error('Error: SDK dist not found. Please run "npm run build" first.');
  process.exit(1);
}

const {
  SkillSchema,
  PlanSchema,
  MemorySchema,
  RepairSchema,
  DeploymentResultSchema,
  ExecutionTraceSchema,
} = sdkSchemas;

const schemas = [
  { name: 'skill.schema.json', schema: SkillSchema },
  { name: 'plan.schema.json', schema: PlanSchema },
  { name: 'memory.schema.json', schema: MemorySchema },
  { name: 'repair.schema.json', schema: RepairSchema },
  { name: 'deployment.schema.json', schema: DeploymentResultSchema },
  { name: 'trace.schema.json', schema: ExecutionTraceSchema },
];

for (const s of schemas) {
  const jsonSchema = zodToJsonSchema(s.schema, {
    name: s.name.replace('.schema.json', ''),
    target: 'jsonSchema7'
  });
  const filepath = path.join(schemasDir, s.name);
  fs.writeFileSync(filepath, JSON.stringify(jsonSchema, null, 2), 'utf8');
  console.log(`Generated JSON schema: ${filepath}`);
}
