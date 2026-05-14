import { useCallback, useEffect, useState } from 'react';
import { loadElectionData, subscribeToElectionChanges } from '../services/electionService';

const DATA_TIMEOUT_MS = 10000;

function withTimeout(promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error('Dashboard data refresh timed out. Please try again.')), DATA_TIMEOUT_MS);
    })
  ]);
}

export function useElectionData() {
  const [data, setData] = useState({ election: null, elections: [], positions: [], voters: [], ballots: [], stats: null, applications: [], candidates: [], ledger: [], auditLogs: [], passwordResetRequests: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const next = await withTimeout(loadElectionData());
      setData(next);
    } catch (err) {
      setError(err.message || 'Unable to load election data.');
    } finally {
      setLoading(false);
    }
  }, []);

  const removeVoterLocal = useCallback((id) => {
    setData((current) => ({
      ...current,
      voters: current.voters.filter((voter) => voter.id !== id)
    }));
  }, []);

  const removeCandidateLocal = useCallback(({ candidateId, applicationId }) => {
    setData((current) => ({
      ...current,
      candidates: candidateId
        ? current.candidates.filter((candidate) => candidate.id !== candidateId)
        : current.candidates,
      applications: applicationId
        ? current.applications.filter((application) => application.id !== applicationId)
        : current.applications
    }));
  }, []);

  useEffect(() => {
    refresh();
    const stop = subscribeToElectionChanges(() => refresh());
    return stop;
  }, [refresh]);

  useEffect(() => {
    function refreshWhenActive() {
      if (document.visibilityState === 'visible') refresh();
    }
    document.addEventListener('visibilitychange', refreshWhenActive);
    window.addEventListener('focus', refreshWhenActive);
    return () => {
      document.removeEventListener('visibilitychange', refreshWhenActive);
      window.removeEventListener('focus', refreshWhenActive);
    };
  }, [refresh]);

  return { ...data, loading, error, refresh, removeVoterLocal, removeCandidateLocal };
}
