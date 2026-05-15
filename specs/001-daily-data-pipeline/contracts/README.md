# Data Contracts

This directory contains JSON Schema definitions for all data structures used in the Daily Data Pipeline.

## Schemas

### daily-record.schema.json

Defines the structure of daily electricity data files stored in `database/{campus}/{building}/{room}-{id}/{YYYYMMDD}.json`.

**Usage**: Validates query results before writing to storage.

### summary.schema.json

Defines the structure of the aggregated summary file stored in `database/summary.json`.

**Usage**: Validates summary generation output for frontend consumption.

### archive-manifest.schema.json

Defines the structure of manifest files included in monthly archives.

**Usage**: Validates archive integrity and metadata.

## Validation

All scripts should validate data against these schemas before processing or storing:

```python
import json
from jsonschema import validate, ValidationError

with open('contracts/daily-record.schema.json') as f:
    schema = json.load(f)

try:
    validate(instance=data_record, schema=schema)
except ValidationError as e:
    print(f"Validation error: {e.message}")
```

## Versioning

Schema changes are versioned using the `$id` field. Breaking changes require:
1. New schema file with version suffix
2. Migration script for existing data
3. Update to all consuming scripts
