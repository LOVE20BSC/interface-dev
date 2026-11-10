import { Link } from 'react-router-dom';
import { copy } from '@/shared/config/copy';
import { buttonStyles } from '@/shared/ui/button';
import { EmptyState } from '@/widgets/empty-state/empty-state';

export function NotFoundPage() {
  return (
    <EmptyState
      title={copy.notFound.title}
      description={copy.notFound.body}
      action={
        <Link to="/" className={buttonStyles('primary', 'md')}>
          {copy.notFound.action}
        </Link>
      }
    />
  );
}
