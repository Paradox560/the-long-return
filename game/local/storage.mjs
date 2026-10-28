import { mkdir, lstat, readFile, writeFile, rename, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

/** App-owned storage only. Never reads Codex, ChatGPT, or another app's credentials. */
export class CredentialStore {
  constructor(directory) { this.directory = directory; this.file = join(directory, 'chatgpt-session.json'); this.queue = Promise.resolve(); }
  async load() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const directory = await lstat(this.directory);
    if (directory.isSymbolicLink() || !directory.isDirectory()) throw new Error('Credential directory must be a real directory.');
    await chmod(this.directory, 0o700);
    try {
      const stat = await lstat(this.file);
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Credential file must be a regular file.');
      await chmod(this.file, 0o600);
      const value = JSON.parse(await readFile(this.file, 'utf8'));
      if (value.version !== 1 || typeof value.hostId !== 'string' || !Array.isArray(value.registrations)) throw new Error('Credential state is invalid.');
      this.state = value;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.state = { version: 1, hostId: `urn:uuid:${randomUUID()}`, activeId: null, registrations: [] };
      await this.save();
    }
    return this.state;
  }
  save() {
    const serialized = JSON.stringify(this.state);
    this.queue = this.queue.catch(() => {}).then(async () => {
      const temporary = join(this.directory, `.session-${randomUUID()}.tmp`);
      await writeFile(temporary, serialized, { flag: 'wx', mode: 0o600 });
      await rename(temporary, this.file);
      await chmod(this.file, 0o600);
    });
    return this.queue;
  }
}
