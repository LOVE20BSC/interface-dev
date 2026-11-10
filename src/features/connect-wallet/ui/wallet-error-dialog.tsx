import { Button } from '@/shared/ui/button';
import { Sheet } from '@/shared/ui/sheet';
import { copy } from '@/shared/config/copy';

export interface WalletErrorDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly message: string;
  readonly onRetry?: () => void;
}

export function WalletErrorDialog({
  open,
  onOpenChange,
  title,
  message,
  onRetry,
}: WalletErrorDialogProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description={message} dismissible>
      <div className="flex flex-col gap-2">
        {onRetry !== undefined ? (
          <Button
            onClick={() => {
              onOpenChange(false);
              onRetry();
            }}
          >
            {copy.wallet.networkErrorRetry}
          </Button>
        ) : null}
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          {copy.wallet.networkErrorClose}
        </Button>
      </div>
    </Sheet>
  );
}
