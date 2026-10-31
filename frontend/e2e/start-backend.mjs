import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, '../../backend');
const isWindows = process.platform === 'win32';
const mavenWrapper = path.join(backendDir, isWindows ? 'mvnw.cmd' : 'mvnw');

// The E2E profile connects to the configured PostgreSQL database and creates
// throwaway accounts with a unique run prefix. This secret only protects those
// test sessions; the dev and production profiles use their own JWT_SECRET.
const DEFAULT_E2E_JWT_SECRET =
  'cHVsc2VjaGF0LWV2ZS1vbmx5LXNlY3JldC1rZXktMDEyMzQ1Njc4OWFiY2RlZmdoaWprbG1ub3A=';

function runMavenBuild() {
  if (!isWindows && existsSync(mavenWrapper)) {
    spawnSync('chmod', ['+x', mavenWrapper], { stdio: 'ignore' });
  }

  const args = [
    '-B',
    '-Dmaven.test.skip=true',
    'package',
  ];
  const result = isWindows
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', mavenWrapper, ...args], {
        cwd: backendDir,
        stdio: 'inherit',
        env: process.env,
      })
    : spawnSync(mavenWrapper, args, {
        cwd: backendDir,
        stdio: 'inherit',
        env: process.env,
      });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function findExecutableJar() {
  const targetDir = path.join(backendDir, 'target');
  if (!existsSync(targetDir)) return null;

  return readdirSync(targetDir)
    .filter((name) => name.endsWith('.jar') && !name.endsWith('.original'))
    .map((name) => path.join(targetDir, name))
    .filter((file) => statSync(file).size > 1_000_000)
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? null;
}

let javaProcess = null;

function stopBackend() {
  if (!javaProcess || javaProcess.killed) return;
  const pid = javaProcess.pid;
  javaProcess = null;
  try {
    if (isWindows) {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGTERM');
    }
  } catch {
    // The process already exited.
  }
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    stopBackend();
    process.exit(0);
  });
}
process.on('exit', stopBackend);

runMavenBuild();

const jar = findExecutableJar();
if (!jar) {
  console.error('[e2e] No executable backend jar found after the Maven build.');
  process.exit(1);
}

const env = {
  ...process.env,
  SPRING_PROFILES_ACTIVE: 'e2e',
  SERVER_PORT: process.env.E2E_API_PORT ?? '8081',
  JWT_SECRET: process.env.JWT_SECRET || DEFAULT_E2E_JWT_SECRET,
  CORS_ALLOWED_ORIGINS:
    process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:4173,http://127.0.0.1:4173',
  AVATAR_UPLOAD_DIR: process.env.AVATAR_UPLOAD_DIR ?? 'uploads/e2e/avatars',
  MEDIA_UPLOAD_DIR: process.env.MEDIA_UPLOAD_DIR ?? 'uploads/e2e/media',
};

console.log(`[e2e] Starting backend on port ${env.SERVER_PORT} from ${jar}`);
javaProcess = spawn('java', ['-jar', jar], {
  cwd: backendDir,
  env,
  stdio: 'inherit',
  detached: !isWindows,
});

javaProcess.on('exit', (code, signal) => {
  console.log(`[e2e] Backend exited (code=${code}, signal=${signal})`);
  javaProcess = null;
  process.exit(code ?? 0);
});
