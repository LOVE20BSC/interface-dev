import { copy } from '@/shared/config/copy';
import { PlaceholderPage } from '@/widgets/placeholder-page/placeholder-page';

export function MePage() {
  return (
    <PlaceholderPage page="me" extraLink={{ to: '/my-nft', label: copy.placeholders.me.extra }} />
  );
}
