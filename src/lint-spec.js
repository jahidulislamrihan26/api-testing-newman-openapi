// Validates spec/openapi.yaml against the OpenAPI 3 schema and checks every $ref resolves.
const path = require('path');
const SwaggerParser = require('@apidevtools/swagger-parser');

const file = path.join(__dirname, '..', 'spec', 'openapi.yaml');
SwaggerParser.validate(file)
  .then((api) => {
    const ops = Object.values(api.paths).reduce((n, p) => n + ['get', 'post', 'put', 'patch', 'delete'].filter((m) => p[m]).length, 0);
    console.log(`OpenAPI spec is valid: ${Object.keys(api.paths).length} paths, ${ops} operations, ${Object.keys(api.components.schemas).length} schemas.`);
  })
  .catch((e) => { console.error('OpenAPI spec is INVALID:', e.message); process.exit(1); });
