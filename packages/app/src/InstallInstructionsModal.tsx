import { useMemo, useState } from 'react';
import cx from 'classnames';
import { Button, Group, Modal, Table } from '@mantine/core';
import { IconClipboard, IconClipboardCheck } from '@tabler/icons-react';

import api from './api';
import Clipboard from './Clipboard';
import { HDX_COLLECTOR_URL } from './config';

function CopyableValue({
  label = '',
  value,
}: {
  label?: React.ReactNode;
  value: string;
}) {
  return (
    <Clipboard text={value} className="d-flex mx-auto p-0 w-100">
      {({ isCopied }) => {
        return (
          <div
            className={cx(
              'd-flex w-100 py-2 px-2 gap-2 rounded align-items-center justify-content-between cursor-pointer',
              {
                'text-success': isCopied,
              },
            )}
          >
            <div className="fs-7 d-flex text-truncate align-items-center">
              {label}
              <pre className="m-0 user-select-all d-inline text-truncate fs-7 lh-1">
                {value}
              </pre>
            </div>
            <Group gap={2} wrap="nowrap" className={cx('fs-7 text-end')}>
              {isCopied ? (
                <IconClipboardCheck size={14} />
              ) : (
                <IconClipboard size={14} />
              )}
              {isCopied ? 'Copied!' : 'Copy'}
            </Group>
          </div>
        );
      }}
    </Clipboard>
  );
}

export default function InstallInstructionModal({
  show,
  onHide,
}: {
  show: boolean;
  onHide: () => void;
}) {
  const { data: team, isLoading, refetch: refetchTeam } = api.useTeam();
  const { data: ingestionTokens, refetch: refetchTokens } =
    api.useIngestionTokens();
  const createToken = api.useCreateIngestionToken();
  const rotateToken = api.useRotateIngestionToken();
  const revokeToken = api.useRevokeIngestionToken();

  const [lastCreatedToken, setLastCreatedToken] = useState<string | null>(null);

  const activeTokens = useMemo(() => {
    return ingestionTokens?.data?.filter(t => t.status === 'active') ?? [];
  }, [ingestionTokens]);

  return (
    <Modal
      opened={show}
      onClose={onHide}
      title="Start Sending Telemetry"
      size="lg"
      centered
    >
      <div className="inter">
        <div className="mb-3">
          <CopyableValue
            label={<span className="text-muted me-2">OTLP Endpoint: </span>}
            value={HDX_COLLECTOR_URL}
          />
        </div>

        {lastCreatedToken && (
          <div className="mb-3">
            <CopyableValue
              label={
                <span className="text-muted me-2">
                  Ingestion Token (copy now):{' '}
                </span>
              }
              value={lastCreatedToken}
            />
          </div>
        )}

        <div className="mb-3 d-flex gap-2">
          <Button
            variant="light"
            onClick={async () => {
              const res = await createToken.mutateAsync({});
              setLastCreatedToken(res.token);
              await refetchTokens();
            }}
            loading={createToken.isPending}
          >
            Create ingestion token
          </Button>
          <Button
            variant="default"
            onClick={async () => {
              setLastCreatedToken(null);
              await refetchTokens();
            }}
          >
            Refresh
          </Button>
        </div>

        {activeTokens.length > 0 && (
          <div className="mb-4">
            <div className="fs-6 mb-2">Active ingestion tokens</div>
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Prefix</Table.Th>
                  <Table.Th>Shard</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {activeTokens.map(t => (
                  <Table.Tr key={t.id}>
                    <Table.Td>
                      <code>{t.tokenPrefix}</code>
                    </Table.Td>
                    <Table.Td>{t.assignedShard ?? '-'}</Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Button
                          size="xs"
                          variant="light"
                          onClick={async () => {
                            const res = await rotateToken.mutateAsync(t.id);
                            setLastCreatedToken(res.token);
                            await refetchTokens();
                          }}
                          loading={rotateToken.isPending}
                        >
                          Rotate
                        </Button>
                        <Button
                          size="xs"
                          variant="default"
                          onClick={async () => {
                            await revokeToken.mutateAsync(t.id);
                            await refetchTokens();
                          }}
                          loading={revokeToken.isPending}
                        >
                          Revoke
                        </Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </div>
        )}

        <div className="fs-7 mb-4">
          Click on a link below to view installation instructions for your
          application.
        </div>
        <div className="fs-6 mb-2">Backend</div>
        <div className="mb-2">
          <a
            href="https://clickhouse.com/docs/use-cases/observability/clickstack/sdks/nodejs"
            target="_blank"
            rel="noreferrer"
            className="text-link"
          >
            Node.js
          </a>
          <span className="ms-2 text-muted">(Logs + Traces)</span>
        </div>
        <div className="mb-2">
          <a
            href="https://clickhouse.com/docs/use-cases/observability/clickstack/sdks/golang"
            target="_blank"
            rel="noreferrer"
            className="text-link"
          >
            Go
          </a>
          <span className="ms-2 text-muted">(Logs + Traces)</span>
        </div>
        <div className="mb-2">
          <a
            href="https://clickhouse.com/docs/use-cases/observability/clickstack/sdks/python"
            target="_blank"
            rel="noreferrer"
            className="text-link"
          >
            Python
          </a>
          <span className="ms-2 text-muted">(Logs + Traces)</span>
        </div>
        <div className="mb-2">
          <a
            href="https://clickhouse.com/docs/use-cases/observability/clickstack/sdks/java"
            target="_blank"
            rel="noreferrer"
            className="text-link"
          >
            Java
          </a>
          <span className="ms-2 text-muted">(Logs + Traces)</span>
        </div>
        <div className="mb-2">
          <a
            href="https://clickhouse.com/docs/use-cases/observability/clickstack/sdks/elixir"
            target="_blank"
            rel="noreferrer"
            className="text-link"
          >
            Elixir
          </a>
          <span className="ms-2 text-muted">(Logs)</span>
        </div>
        <div className="mb-2">
          <a
            href="https://clickhouse.com/docs/use-cases/observability/clickstack/sdks/ruby-on-rails"
            target="_blank"
            rel="noreferrer"
            className="text-link"
          >
            Ruby on Rails
          </a>
          <span className="ms-2 text-muted">(Traces)</span>
        </div>
        <div className="fs-6 mb-2 mt-4">Platform</div>
        <div className="mb-2">
          <a
            href="https://clickhouse.com/docs/use-cases/observability/clickstack/ingesting-data/kubernetes"
            target="_blank"
            rel="noreferrer"
            className="text-link"
          >
            Kubernetes
          </a>
          <span className="ms-2 text-muted">(Logs + Metrics)</span>
        </div>
        <div className="fs-6 mb-2 mt-4">Browser</div>
        <div className="mb-2">
          <a
            href="https://clickhouse.com/docs/use-cases/observability/clickstack/sdks/browser"
            target="_blank"
            rel="noreferrer"
            className="text-link"
          >
            JavaScript/TypeScript
          </a>
          <span className="ms-2 text-muted">(Logs + Traces)</span>
        </div>
        <div className="fs-6 mb-2 mt-4">Data Collector</div>
        <div className="mb-2">
          <a
            href="https://clickhouse.com/docs/use-cases/observability/clickstack/ingesting-data/opentelemetry#sending-otel-data"
            target="_blank"
            rel="noreferrer"
            className="text-link"
          >
            OpenTelemetry
          </a>
          <span className="ms-2 text-muted">(Logs + Traces)</span>
        </div>
        <div className="mt-4">
          <Button variant="default" onClick={() => onHide()}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
