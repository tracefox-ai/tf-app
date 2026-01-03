// @ts-nocheck TODO: remove this line

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { NextSeo } from 'next-seo';
import { SubmitHandler, useForm, useWatch } from 'react-hook-form';
import {
  Button,
  Notification,
  Paper,
  PasswordInput,
  Stack,
  TextInput,
} from '@mantine/core';
import { IconAt, IconLock, IconUsers } from '@tabler/icons-react';

import api from './api';
import LandingHeader from './LandingHeader';
import { CheckOrX, PasswordCheck } from './PasswordCheck';

type FormData = {
  teamName: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export default function SaasSignupPage() {
  const router = useRouter();
  const { data: team, isLoading: teamIsLoading } = api.useTeam();

  const isLoggedIn = Boolean(!teamIsLoading && team);
  useEffect(() => {
    if (isLoggedIn) {
      router.push('/search');
    }
  }, [isLoggedIn, router]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    control,
  } = useForm<FormData>({ reValidateMode: 'onSubmit' });

  const currentPassword = useWatch({
    control,
    name: 'password',
    defaultValue: '',
  });
  const confirmPassword = useWatch({
    control,
    name: 'confirmPassword',
    defaultValue: '',
  });

  const confirmPass = () => currentPassword === confirmPassword;

  const registerPassword = api.useRegisterPassword();

  const onSubmit: SubmitHandler<FormData> = data =>
    registerPassword.mutate(
      {
        teamName: data.teamName,
        email: data.email,
        password: data.password,
        confirmPassword: data.confirmPassword,
      } as any,
      {
        onSuccess: () => router.push('/search'),
        onError: async error => {
          const jsonData = await error.response.json();
          if (Array.isArray(jsonData) && jsonData[0]?.errors?.issues) {
            return jsonData[0].errors.issues.forEach((issue: any) => {
              setError(issue.path[0], {
                type: issue.code,
                message: issue.message,
              });
            });
          }
          setError('root', {
            type: 'manual',
            message: 'An unexpected error occurred, please try again later.',
          });
        },
      },
    );

  return (
    <div className="AuthPage">
      <NextSeo title="HyperDX - Sign up" />
      <LandingHeader activeKey="/signup" fixed />
      <div className="d-flex justify-content-center align-items-center vh-100">
        <div style={{ width: '26rem' }}>
          <div className="text-center mb-2 fs-5 " style={{ marginTop: -30 }}>
            Sign up for <span className="text-success fw-bold">HyperDX</span>
          </div>
          <div className="text-center mb-2 text-muted">
            Create your organization and admin user.
          </div>

          <form className="text-start mt-4" onSubmit={handleSubmit(onSubmit)}>
            <Stack gap="xl">
              <Paper p={34} shadow="md" radius="md">
                <Stack gap="lg">
                  <TextInput
                    label="Team / Org Name"
                    size="md"
                    withAsterisk={false}
                    placeholder="Acme Inc"
                    leftSection={<IconUsers size={18} />}
                    error={errors.teamName?.message}
                    required
                    {...register('teamName', { required: true })}
                  />
                  <TextInput
                    label="Email"
                    size="md"
                    withAsterisk={false}
                    placeholder="you@company.com"
                    type="email"
                    leftSection={<IconAt size={18} />}
                    error={errors.email?.message}
                    required
                    {...register('email', { required: true })}
                  />
                  <PasswordInput
                    size="md"
                    label="Password"
                    withAsterisk={false}
                    leftSection={<IconLock size={16} />}
                    error={errors.password?.message}
                    required
                    placeholder="Password"
                    {...register('password', { required: true })}
                  />
                  <>
                    <PasswordInput
                      label={
                        <CheckOrX
                          handler={confirmPass}
                          password={currentPassword}
                        >
                          Confirm Password
                        </CheckOrX>
                      }
                      size="md"
                      required
                      withAsterisk={false}
                      leftSection={<IconLock size={16} />}
                      error={errors.confirmPassword?.message}
                      placeholder="Confirm Password"
                      {...register('confirmPassword', { required: true })}
                    />
                    <Notification withCloseButton={false}>
                      <PasswordCheck password={currentPassword} />
                    </Notification>
                  </>

                  <Button
                    mt={4}
                    type="submit"
                    variant="light"
                    size="md"
                    disabled={isSubmitting}
                    loading={isSubmitting}
                    data-test-id="submit"
                  >
                    Create account
                  </Button>
                </Stack>
              </Paper>

              {errors.root?.message && (
                <Notification withCloseButton={false} withBorder color="red">
                  {errors.root.message}
                </Notification>
              )}

              <div className="text-center fs-8 ">
                Already have an account? <Link href="/login">Log in</Link>{' '}
                instead.
              </div>
            </Stack>
          </form>
        </div>
      </div>
    </div>
  );
}
