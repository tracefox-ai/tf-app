import { useEffect } from 'react';
import { useRouter } from 'next/router';

import api from '@/api';
import AuthLoadingBlocker from '@/AuthLoadingBlocker';
import { IS_LOCAL_MODE, IS_OSS } from '@/config';

export default function LandingPage() {
  const { data: team, isLoading: teamIsLoading } = api.useTeam();
  const router = useRouter();

  const isLoggedIn = Boolean(!teamIsLoading && team);

  useEffect(() => {
    if (isLoggedIn || IS_LOCAL_MODE) {
      router.push('/search');
    }
  }, [isLoggedIn, router]);

  useEffect(() => {
    if (!IS_OSS) {
      router.push('/login');
    }
  }, [router]);

  const { data: installation } = api.useInstallation();
  useEffect(() => {
    if (!IS_OSS) return;
    if (installation?.isTeamExisting === true) {
      router.push('/login');
    } else if (installation?.isTeamExisting === false) {
      router.push('/signup');
    }
  }, [installation, router]);

  return <AuthLoadingBlocker />;
}
