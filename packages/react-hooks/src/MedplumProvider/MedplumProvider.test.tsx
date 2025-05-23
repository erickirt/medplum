import {
  ClientStorage,
  MedplumClientEventMap,
  MemoryStorage,
  MockAsyncClientStorage,
  ProfileResource,
  getDisplayString,
  sleep,
} from '@medplum/core';
import { FhirRouter, MemoryRepository } from '@medplum/fhir-router';
import { MockClient, MockFetchClient, createFakeJwt } from '@medplum/mock';
import { act, render, screen } from '@testing-library/react';
import { JSX, useEffect, useRef, useState } from 'react';
import { MedplumProvider } from './MedplumProvider';
import { useMedplum, useMedplumContext, useMedplumNavigate, useMedplumProfile } from './MedplumProvider.context';

describe('MedplumProvider', () => {
  test('Renders component', () => {
    function MyComponent(): JSX.Element {
      const medplum = useMedplum();
      const context = useMedplumContext();
      const navigate = useMedplumNavigate();
      const profile = useMedplumProfile();

      return (
        <div>
          <div>MyComponent</div>
          <div>{getDisplayString(medplum.getProfile() as ProfileResource)}</div>
          <div>Context: {Boolean(context).toString()}</div>
          <div>Navigate: {Boolean(navigate).toString()}</div>
          <div>Profile: {Boolean(profile).toString()}</div>
        </div>
      );
    }

    render(
      <MedplumProvider medplum={new MockClient()}>
        <MyComponent />
      </MedplumProvider>
    );

    expect(screen.getByText('MyComponent')).toBeInTheDocument();
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Context: true')).toBeInTheDocument();
    expect(screen.getByText('Navigate: true')).toBeInTheDocument();
    expect(screen.getByText('Profile: true')).toBeInTheDocument();
  });

  describe('Loading is always in sync with MedplumClient#isLoading()', () => {
    function MyComponent(): JSX.Element {
      const { loading } = useMedplumContext();
      return loading ? <div>Loading...</div> : <div>Loaded!</div>;
    }

    test('No active login & AsyncClientStorage', async () => {
      let storage: MockAsyncClientStorage;
      let medplum!: MockClient;

      act(() => {
        storage = new MockAsyncClientStorage();
        medplum = new MockClient({ storage });
      });

      expect(medplum.isLoading()).toEqual(true);

      act(() => {
        render(
          <MedplumProvider medplum={medplum}>
            <MyComponent />
          </MedplumProvider>
        );
      });

      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(true);

      // Sleep to make sure that loading doesn't go to false before we set storage to initialized
      await act(async () => {
        await sleep(250);
      });

      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(true);

      // Finally set storage to initialized
      act(() => {
        storage.setInitialized();
      });

      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(true);

      expect(await screen.findByText('Loaded!')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(false);
    });

    test('Active login & AsyncClientStorage', async () => {
      let storage: MockAsyncClientStorage;
      let medplum!: MockClient;

      act(() => {
        storage = new MockAsyncClientStorage();
        storage.setObject('activeLogin', {
          // This access token contains a field `login_id` which is necessary to pass the validation required in `isMedplumAccessToken`
          // to get into the state of `MedplumClient.medplumServer === true`
          accessToken:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWF0IjoxNTE2MjM5MDIyLCJsb2dpbl9pZCI6InRlc3RpbmcxMjMifQ.lJGCbp2taTarRbamxaKFsTR_VRVgzvttKMmI5uFQSM0',
          refreshToken: '456',
          profile: {
            reference: 'Practitioner/123',
          },
          project: {
            reference: 'Project/123',
          },
        });
        medplum = new MockClient({
          storage,
        });
      });

      const getSpy = jest.spyOn(medplum, 'get');

      expect(medplum.isLoading()).toEqual(true);

      act(() => {
        render(
          <MedplumProvider medplum={medplum}>
            <MyComponent />
          </MedplumProvider>
        );
      });

      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(true);

      // Sleep to make sure that loading doesn't go to false before we set storage to initialized
      await act(async () => {
        await sleep(250);
      });

      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(true);

      // Finally set storage to initialized
      act(() => {
        storage.setInitialized();
      });

      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(true);

      // Sleep to make sure that we can resolve stuff
      await act(async () => {
        await sleep(0);
      });

      expect(await screen.findByText('Loaded!')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(false);
      expect(getSpy).toHaveBeenCalledWith('auth/me', expect.any(Object));

      getSpy.mockRestore();
    });

    test('No active login & NO AsyncClientStorage', async () => {
      const baseUrl = 'https://example.com/';
      let medplum!: MockClient;
      const router = new FhirRouter();
      const repo = new MemoryRepository();
      const client = new MockFetchClient(router, repo, baseUrl);
      const mockFetchSpy = jest.spyOn(client, 'mockFetch');

      act(() => {
        medplum = new MockClient();
      });

      expect(medplum.isLoading()).toEqual(true);

      act(() => {
        render(
          <MedplumProvider medplum={medplum}>
            <MyComponent />
          </MedplumProvider>
        );
      });

      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(true);

      expect(await screen.findByText('Loaded!')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(false);
      expect(mockFetchSpy).not.toHaveBeenCalledWith(`${baseUrl}auth/me`, expect.objectContaining({ method: 'GET' }));
    });

    test('Active login & NO AsyncClientStorage', async () => {
      const baseUrl = 'https://example.com/';
      const storage = new ClientStorage(new MemoryStorage());
      storage.setObject('activeLogin', {
        accessToken:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWF0IjoxNTE2MjM5MDIyLCJsb2dpbl9pZCI6InRlc3RpbmcxMjMifQ.lJGCbp2taTarRbamxaKFsTR_VRVgzvttKMmI5uFQSM0',
        refreshToken: '456',
        profile: {
          reference: 'Practitioner/123',
        },
        project: {
          reference: 'Project/123',
        },
      });

      let medplum!: MockClient;
      const router = new FhirRouter();
      const repo = new MemoryRepository();
      const client = new MockFetchClient(router, repo, baseUrl);
      const mockFetchSpy = jest.spyOn(client, 'mockFetch');

      act(() => {
        medplum = new MockClient({
          storage,
          mockFetchOverride: { router, repo, client },
        });
      });

      expect(medplum.isLoading()).toEqual(true);

      act(() => {
        render(
          <MedplumProvider medplum={medplum}>
            <MyComponent />
          </MedplumProvider>
        );
      });

      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(true);

      expect(await screen.findByText('Loaded!')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(false);
      expect(mockFetchSpy).toHaveBeenCalledWith(`${baseUrl}auth/me`, expect.objectContaining({ method: 'GET' }));

      mockFetchSpy.mockRestore();
    });

    test('Refreshing profile re-triggers loading when no profile present', async () => {
      const baseUrl = 'https://example.com/';
      const storage = new ClientStorage(new MemoryStorage());
      storage.setObject('activeLogin', {
        accessToken:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWF0IjoxNTE2MjM5MDIyLCJsb2dpbl9pZCI6InRlc3RpbmcxMjMifQ.lJGCbp2taTarRbamxaKFsTR_VRVgzvttKMmI5uFQSM0',
        refreshToken: '456',
        profile: {
          reference: 'Practitioner/123',
        },
        project: {
          reference: 'Project/123',
        },
      });

      let medplum!: MockClient;
      const router = new FhirRouter();
      const repo = new MemoryRepository();
      const client = new MockFetchClient(router, repo, baseUrl);
      const mockFetchSpy = jest.spyOn(client, 'mockFetch');
      let dispatchEventSpy!: jest.SpyInstance;

      act(() => {
        medplum = new MockClient({
          storage,
          mockFetchOverride: { router, repo, client },
        });
        dispatchEventSpy = jest.spyOn(medplum, 'dispatchEvent');
      });

      expect(medplum.isLoading()).toEqual(true);

      act(() => {
        render(
          <MedplumProvider medplum={medplum}>
            <MyComponent />
          </MedplumProvider>
        );
      });

      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(true);

      expect(await screen.findByText('Loaded!')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(false);
      expect(mockFetchSpy).toHaveBeenCalledWith(`${baseUrl}auth/me`, expect.objectContaining({ method: 'GET' }));
      expect(dispatchEventSpy).toHaveBeenCalledWith({ type: 'profileRefreshed' });

      mockFetchSpy.mockClear();
      dispatchEventSpy.mockClear();

      let loginPromise!: Promise<void>;

      act(() => {
        // We clear the active login so that we can test what happens when we call `getProfileAsync()`
        // Which we want to call `refreshProfile()`
        // Which is only possible if `sessionDetails` is not defined
        medplum.clearActiveLogin();
        medplum.setAccessToken(
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWF0IjoxNTE2MjM5MDIyLCJsb2dpbl9pZCI6InRlc3RpbmcxMjMifQ.lJGCbp2taTarRbamxaKFsTR_VRVgzvttKMmI5uFQSM0'
        );
        // This is what is testing that we go back to a loading state when profile is being refreshed
        loginPromise = medplum.setActiveLogin({
          accessToken:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWF0IjoxNTE2MjM5MDIyLCJsb2dpbl9pZCI6InRlc3RpbmcxMjMifQ.lJGCbp2taTarRbamxaKFsTR_VRVgzvttKMmI5uFQSM0',
          refreshToken: '456',
          profile: {
            reference: 'Practitioner/123',
          },
          project: {
            reference: 'Project/123',
          },
        });
      });

      expect(medplum.isLoading()).toEqual(true);
      expect(await screen.findByText('Loading...')).toBeInTheDocument();
      expect(dispatchEventSpy).toHaveBeenCalledWith({ type: 'profileRefreshing' });

      expect(await screen.findByText('Loaded!')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(false);
      expect(dispatchEventSpy).toHaveBeenCalledWith({ type: 'profileRefreshed' });

      await loginPromise;

      expect(mockFetchSpy).toHaveBeenCalledWith(`${baseUrl}auth/me`, expect.objectContaining({ method: 'GET' }));
    });

    test('Refreshing profile when profile present does not unmount children guarded by `.isLoading()`', async () => {
      function RenderCounter({ parentRenderCount }: { parentRenderCount: number }): JSX.Element {
        const [childCount, setChildCount] = useState(0);

        useEffect(() => {
          setChildCount((prevCount) => prevCount + 1);
        }, [parentRenderCount]);

        return (
          <div>
            <div>Parent count: {parentRenderCount}</div>
            <div>Child count: {childCount}</div>
          </div>
        );
      }

      function MyComponent(): JSX.Element {
        const renderCountRef = useRef(0);
        renderCountRef.current += 1;

        const { loading } = useMedplumContext();
        if (loading) {
          return <div>Loading...</div>;
        }

        return <RenderCounter parentRenderCount={renderCountRef.current} />;
      }

      const baseUrl = 'https://example.com/';
      const storage = new ClientStorage(new MemoryStorage());
      storage.setObject('activeLogin', {
        accessToken: createFakeJwt({
          sub: '1234567890',
          iat: Math.ceil(Date.now() / 1000),
          exp: Math.ceil(Date.now() / 1000) + 60 * 60,
          client_id: '123',
          login_id: '123',
        }),
        refreshToken: createFakeJwt({ client_id: '123' }),
        profile: {
          reference: 'Practitioner/123',
        },
        project: {
          reference: 'Project/123',
        },
      });

      let medplum!: MockClient;
      const router = new FhirRouter();
      const repo = new MemoryRepository();
      const client = new MockFetchClient(router, repo, baseUrl);
      const mockFetchSpy = jest.spyOn(client, 'mockFetch');
      let dispatchEventSpy!: jest.SpyInstance;

      act(() => {
        medplum = new MockClient({
          storage,
          mockFetchOverride: { router, repo, client },
        });
        dispatchEventSpy = jest.spyOn(medplum, 'dispatchEvent');
      });

      expect(medplum.isLoading()).toEqual(true);

      act(() => {
        render(
          <MedplumProvider medplum={medplum}>
            <MyComponent />
          </MedplumProvider>
        );
      });

      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(true);

      expect(await screen.findByText('Parent count: 2')).toBeInTheDocument();
      expect(await screen.findByText('Child count: 1')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(false);
      expect(mockFetchSpy).toHaveBeenCalledWith(`${baseUrl}auth/me`, expect.objectContaining({ method: 'GET' }));
      expect(dispatchEventSpy).toHaveBeenCalledWith({ type: 'profileRefreshed' });

      mockFetchSpy.mockClear();
      dispatchEventSpy.mockClear();

      const refreshingPromise = new Promise((resolve) => {
        medplum.addEventListener('profileRefreshing', resolve);
      });

      act(() => {
        medplum.refreshIfExpired(1000 * 60 * 60 * 2 /* 2 hours in ms */).catch(console.error);
      });

      const refreshedPromise = new Promise((resolve) => {
        medplum.addEventListener('profileRefreshing', resolve);
      });

      await act(async () => {
        await refreshingPromise;
        expect(medplum.isLoading()).toEqual(false);
        await refreshedPromise;
      });

      expect(dispatchEventSpy).toHaveBeenCalledWith({ type: 'profileRefreshing' });
      expect(dispatchEventSpy).toHaveBeenCalledWith({ type: 'profileRefreshed' });
      expect(medplum.isLoading()).toEqual(false);
      expect(screen.getByText('Parent count: 4')).toBeInTheDocument();
      expect(screen.getByText('Child count: 3')).toBeInTheDocument();

      expect(mockFetchSpy).toHaveBeenLastCalledWith(`${baseUrl}auth/me`, expect.objectContaining({ method: 'GET' }));
    });

    test('Async ClientStorage.getInitPromise throws', async () => {
      const originalConsoleError = console.error;
      console.error = jest.fn();

      class TestAsyncStorage extends MockAsyncClientStorage {
        private promise: Promise<void>;
        private reject!: (err: Error) => void;
        constructor() {
          super();
          this.promise = new Promise((_resolve, reject) => {
            this.reject = reject;
          });
        }

        getInitPromise(): Promise<void> {
          return this.promise;
        }

        rejectInitPromise(): void {
          this.reject(new Error('Failed to init storage!'));
        }
      }

      const storage = new TestAsyncStorage();
      let medplum!: MockClient;
      let dispatchEventSpy!: jest.SpyInstance;

      act(() => {
        medplum = new MockClient({
          storage,
        });
        dispatchEventSpy = jest.spyOn(medplum, 'dispatchEvent');
      });

      expect(medplum.isLoading()).toEqual(true);

      act(() => {
        render(
          <MedplumProvider medplum={medplum}>
            <MyComponent />
          </MedplumProvider>
        );
      });

      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(true);

      act(() => {
        storage.rejectInitPromise();
      });

      expect(await screen.findByText('Loaded!')).toBeInTheDocument();
      expect(medplum.isLoading()).toEqual(false);
      expect(dispatchEventSpy).toHaveBeenCalledWith<[MedplumClientEventMap['storageInitFailed']]>({
        type: 'storageInitFailed',
        payload: { error: new Error('Failed to init storage!') },
      });
      expect(dispatchEventSpy).not.toHaveBeenCalledWith<[MedplumClientEventMap['storageInitialized']]>({
        type: 'storageInitialized',
      });

      expect(console.error).toHaveBeenCalledWith(new Error('Failed to init storage!'));
      console.error = originalConsoleError;
    });
  });
});
