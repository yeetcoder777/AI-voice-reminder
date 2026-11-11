const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./loadTs.cjs');
const { EnrollmentSession } = load('src/enrollment.ts', { './voiceMath': load('src/voiceMath.ts') });

test('profile requires three explicit confirmations from distinct capture sessions', () => {
  const enrollment = new EnrollmentSession();
  assert.throws(() => enrollment.reference(), /three/);
  enrollment.accept(1, [1, 0]);
  assert.equal(enrollment.count, 1);
  assert.throws(() => enrollment.accept(1, [1, 0]), /new sample/);
  assert.equal(enrollment.count, 1);
  enrollment.accept(2, [1, 0.1]);
  assert.throws(() => enrollment.reference(), /three/);
  enrollment.accept(3, [1, -0.1]);
  assert.equal(enrollment.count, 3);
  assert.ok(Math.abs(Math.hypot(...enrollment.reference()) - 1) < 1e-10);
  assert.throws(() => enrollment.accept(4, [1, 0]), /already/);
});
test('invalid sample validation happens before progress changes; cancel resets progress', () => {
  const enrollment = new EnrollmentSession();
  assert.throws(() => enrollment.accept(1, [0, 0]));
  assert.equal(enrollment.count, 0);
  enrollment.accept(1, [1, 0]);
  assert.throws(() => enrollment.accept(2, [1]), /Incompatible/);
  assert.equal(enrollment.count, 1);
  enrollment.reset();
  assert.equal(enrollment.count, 0);
  enrollment.accept(1, [1, 0]);
  assert.equal(enrollment.count, 1);
});
