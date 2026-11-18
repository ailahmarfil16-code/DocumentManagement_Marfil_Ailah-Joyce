import assert from 'node:assert/strict';
import test from 'node:test';
import { runDocumentApiTestSuite } from './testRunner.ts';

test('Document Management REST API automated integration suite', async (t) => {
  const report = await runDocumentApiTestSuite();

  for (const item of report.results) {
    await t.test(item.name, () => {
      assert.equal(
        item.passed,
        true,
        `${item.name} failed (expected HTTP ${item.expectedStatus}, got ${item.actualStatus}): ${item.details}`,
      );
    });
  }

  assert.equal(report.failed, 0, `${report.failed} test(s) failed`);
});
