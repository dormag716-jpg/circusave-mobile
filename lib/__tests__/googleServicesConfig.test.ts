const appConfig = require('../../app.config');
const { googleServicesFileFor } = appConfig;

const ROOT = process.platform === 'win32' ? 'C:\\proj' : '/proj';

function firebaseJson(packageName: string) {
  return JSON.stringify({
    project_info: { project_number: '000000000000', project_id: 'example-project' },
    client: [
      {
        client_info: {
          mobilesdk_app_id: '1:000000000000:android:0000000000000000',
          android_client_info: { package_name: packageName },
        },
      },
    ],
  });
}

function run(options: { files?: Record<string, string>; envPath?: string }) {
  const files = options.files ?? {};
  return googleServicesFileFor({
    envPath: options.envPath,
    projectRoot: ROOT,
    exists: (file: string) => Object.prototype.hasOwnProperty.call(files, file),
    readText: (file: string) => files[file],
  });
}

const DEFAULT_FILE = `${ROOT}${process.platform === 'win32' ? '\\' : '/'}google-services.json`;

describe('google-services.json for Android push', () => {
  test('is left out when there is no file, so builds behave as before', () => {
    expect(run({})).toBeUndefined();
  });

  test('uses ./google-services.json when it exists for this package', () => {
    expect(
      run({ files: { [DEFAULT_FILE]: firebaseJson('com.circusave.mobile') } }),
    ).toBe('./google-services.json');
  });

  test('prefers the GOOGLE_SERVICES_JSON path (an EAS file variable)', () => {
    const eas = process.platform === 'win32' ? 'C:\\eas\\gs.json' : '/eas/gs.json';
    expect(
      run({ envPath: eas, files: { [eas]: firebaseJson('com.circusave.mobile') } }),
    ).toBe(eas);
  });

  test('ignores a blank GOOGLE_SERVICES_JSON value', () => {
    expect(
      run({
        envPath: '   ',
        files: { [DEFAULT_FILE]: firebaseJson('com.circusave.mobile') },
      }),
    ).toBe('./google-services.json');
  });

  test('fails early when the file is for a different package', () => {
    expect(() =>
      run({ files: { [DEFAULT_FILE]: firebaseJson('com.example.other') } }),
    ).toThrow(/no Android client for com\.circusave\.mobile/);
  });

  test('fails early when the file is not valid JSON', () => {
    expect(() => run({ files: { [DEFAULT_FILE]: '{ not json' } })).toThrow(
      /not valid JSON/,
    );
  });

  test('fails early when the file has no clients', () => {
    expect(() => run({ files: { [DEFAULT_FILE]: '{}' } })).toThrow(
      /no Android client/,
    );
  });
});

describe('app config android section', () => {
  const base = {
    config: { android: { package: 'com.circusave.mobile' }, plugins: [] },
  };

  test('keeps the existing Android settings and adds nothing without a file', () => {
    const previous = process.env.GOOGLE_SERVICES_JSON;
    delete process.env.GOOGLE_SERVICES_JSON;
    try {
      const result = appConfig({ ...base, projectRoot: ROOT });
      expect(result.android).toEqual({ package: 'com.circusave.mobile' });
      expect(result.android.googleServicesFile).toBeUndefined();
    } finally {
      if (previous !== undefined) process.env.GOOGLE_SERVICES_JSON = previous;
    }
  });
});
