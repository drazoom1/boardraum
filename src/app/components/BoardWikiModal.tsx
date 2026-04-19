import { BoardGame } from '../App';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from './ui/dialog';
import { GameCustom } from './GameCustom';

interface BoardWikiModalProps {
  game: BoardGame | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigateToWiki?: (category: string, game: BoardGame) => void;
  accessToken?: string;
  userEmail?: string;
  ownedGames?: BoardGame[];
  wishlistGames?: BoardGame[];
  onAddToWishlist?: (game: BoardGame) => void;
}

export function BoardWikiModal({
  game,
  open,
  onOpenChange,
  accessToken,
  userEmail,
  ownedGames = [],
  wishlistGames = [],
  onAddToWishlist,
}: BoardWikiModalProps) {
  if (!game) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl w-full max-h-[90vh] overflow-y-auto p-4">
        <DialogTitle className="sr-only">{game.koreanName} 보드위키</DialogTitle>
        <GameCustom
          initialGame={game}
          isEmbedded={true}
          onClose={() => onOpenChange(false)}
          accessToken={accessToken || ''}
          userEmail={userEmail || ''}
          ownedGames={ownedGames}
          wishlistGames={wishlistGames}
          onAddToWishlist={onAddToWishlist}
        />
      </DialogContent>
    </Dialog>
  );
}
