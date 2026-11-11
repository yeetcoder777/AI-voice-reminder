import { centroid, unit } from './voiceMath';

/** A sample counts only after explicit confirmation, once per capture session. */
export class EnrollmentSession {
  private vectors: number[][] = [];
  private sessions = new Set<number>();
  get count() { return this.vectors.length; }
  accept(sessionId: number, vector: number[]) {
    if (this.count >= 3) throw new Error('Enrollment already contains three samples');
    if (this.sessions.has(sessionId)) throw new Error('Record a new sample before continuing');
    const normalized = unit(vector);
    if (this.vectors.length && normalized.length !== this.vectors[0].length) throw new Error('Incompatible voice sample');
    this.vectors.push(normalized); this.sessions.add(sessionId);
  }
  reference() {
    if (this.count !== 3) throw new Error('Confirm three separate recordings first');
    return centroid(this.vectors);
  }
  reset() { this.vectors = []; this.sessions.clear(); }
}
