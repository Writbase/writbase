import { AgentKeyList } from '@/components/agent-key-list';
import { ErrorBoundary } from '@/components/error-boundary';

export default function AgentKeysPage() {
  return (
    <div>
      <ErrorBoundary>
        <AgentKeyList />
      </ErrorBoundary>
    </div>
  );
}
