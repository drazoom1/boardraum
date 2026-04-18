import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { KeyRound, Eye, EyeOff, CheckCircle } from 'lucide-react';

interface PasswordResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (newPassword: string) => Promise<void>;
}

export function PasswordResetModal({ isOpen, onClose, onSubmit }: PasswordResetModalProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isDone, setIsDone] = useState(false);

  const handleSubmit = async () => {
    setError('');

    if (!newPassword.trim()) {
      setError('새 비밀번호를 입력해주세요.');
      return;
    }
    if (newPassword.length < 4) {
      setError('비밀번호는 4자리 이상이어야 합니다.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setIsLoading(true);
    try {
      await onSubmit(newPassword);
      setIsDone(true);
    } catch (err: any) {
      setError(err.message || '비밀번호 변경 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setIsDone(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-teal-500" />
            비밀번호 재설정
          </DialogTitle>
          <DialogDescription>
            새로운 비밀번호를 입력해주세요.
          </DialogDescription>
        </DialogHeader>

        {isDone ? (
          <div className="py-6 flex flex-col items-center gap-3 text-center">
            <CheckCircle className="w-12 h-12 text-teal-500" />
            <p className="font-semibold text-gray-800">비밀번호가 변경되었습니다!</p>
            <p className="text-sm text-gray-500">다음 로그인부터 새 비밀번호를 사용해주세요.</p>
            <Button onClick={handleClose} className="mt-2 w-full bg-teal-500 hover:bg-teal-600">
              확인
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">새 비밀번호</label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="새 비밀번호 입력"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">비밀번호 확인</label>
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="비밀번호 재입력"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                취소
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isLoading}
                className="flex-1 bg-teal-500 hover:bg-teal-600"
              >
                {isLoading ? '변경 중...' : '비밀번호 변경'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}