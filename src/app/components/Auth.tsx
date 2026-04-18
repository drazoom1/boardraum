import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { LogIn, UserPlus, Loader2, ArrowRight, ArrowLeft, X, Mail, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabaseClient } from '../lib/supabase';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import logoImage from 'figma:asset/761b2997d226ac833225bcda7ecc7f9160e872b3.png';

const supabase = getSupabaseClient();

interface AuthProps {
  onAuthSuccess: (accessToken: string) => void;
  initialSignup?: boolean;
  referralCode?: string;
}

export function Auth({ onAuthSuccess, initialSignup = false, referralCode: externalReferralCode = '' }: AuthProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // view: 'login' | 'signup' | 'forgot'
  const [view, setView] = useState<'login' | 'signup' | 'forgot'>(initialSignup ? 'signup' : 'login');

  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');

  const [signupStep, setSignupStep] = useState(1);
  const [signupName, setSignupName] = useState('');
  const [signupNickname, setSignupNickname] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [referralCode, setReferralCode] = useState(externalReferralCode);
  const [signupCompleted, setSignupCompleted] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [emailDuplicate, setEmailDuplicate] = useState(false);
  const [nicknameDuplicate, setNicknameDuplicate] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) { setForgotError('이메일을 입력해주세요'); return; }
    setForgotLoading(true);
    setForgotError('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: 'https://boardraum.site?reset=true',
      });
      if (error) throw error;
      setForgotSent(true);
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('rate limit') || msg.includes('429')) {
        setForgotError('잠시 후 다시 시도해주세요.');
      } else {
        setForgotError(msg || '이메일 전송에 실패했어요. 다시 시도해주세요.');
      }
    }
    setForgotLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) { setLoginError('이메일과 비밀번호를 입력해주세요'); return; }
    setIsLoading(true);
    setLoginError('');
    try {
      // 먼저 기존 세션 초기화 (stale 세션 충돌 방지)
      await supabase.auth.signOut().catch(() => {});
      
      const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
      if (error) {
        console.error('[Login] Error:', error.message, error.status);
        if (error.message.includes('Invalid login credentials') || error.message.includes('invalid_credentials')) {
          setLoginError('이메일 또는 비밀번호가 올바르지 않아요');
        } else if (error.message.includes('Email not confirmed')) {
          setLoginError('이메일 인증이 필요해요. 관리자에게 문의해주세요');
        } else if (error.status === 400 || error.status === 401) {
          setLoginError('이메일 또는 비밀번호가 올바르지 않아요');
        } else {
          setLoginError(`로그인에 실패했어요: ${error.message}`);
        }
        return;
      }
      if (data.session?.access_token) { onAuthSuccess(data.session.access_token); }
      else setLoginError('로그인 세션을 가져올 수 없어요');
    } catch (e: any) {
      console.error('[Login] Unexpected error:', e);
      setLoginError('로그인에 실패했어요. 잠시 후 다시 시도해주세요');
    } finally { setIsLoading(false); }
  };

  const handleSignup = async (e?: React.FormEvent) => {
    e?.preventDefault();
    console.log('[handleSignup] 호출됨', { signupEmail, signupName, signupPhone, privacyAgreed });
    if (!signupEmail || !signupPassword || !signupName || !signupPhone) { toast.error('모든 필수 항목을 입력해주세요'); return; }
    if (!privacyAgreed) { toast.error('개인정보 수집·이용에 동의해주세요'); return; }
    if (signupPassword.length < 6) { toast.error('비밀번호는 최소 6자 이상이어야 합니다'); return; }
    setIsLoading(true);
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${publicAnonKey}` },
        body: JSON.stringify({ email: signupEmail, password: signupPassword, name: signupName, phone: signupPhone, username: signupNickname.trim() || '', referralCode: referralCode.trim() || '' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '회원가입 실패');
      setSignupCompleted(true);
    } catch (error: any) {
      toast.error(error.message || '회원가입 실패. 다시 시도해주세요.');
    } finally { setIsLoading(false); }
  };

  const handleNextStep = async () => {
    if (signupStep === 1 && !signupName.trim()) { toast.error('이름을 입력해주세요'); return; }
    if (signupStep === 2 && signupNickname.trim()) {
      try {
        const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/auth/check-nickname`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${publicAnonKey}` },
          body: JSON.stringify({ username: signupNickname }),
        });
        const result = await res.json();
        if (result.exists) { setNicknameDuplicate(true); return; }
        else setNicknameDuplicate(false);
      } catch {}
    }
    setNicknameDuplicate(false);
    setEmailDuplicate(false);
    if (signupStep === 3 && !signupPhone.trim()) { toast.error('전화번호를 입력해주세요'); return; }
    if (signupStep === 4) {
      if (!signupEmail.trim()) { toast.error('이메일을 입력해주세요'); return; }
      if (!emailVerified) { toast.error('이메일 인증을 완료해주세요'); return; }
      setIsLoading(true);
      try {
        const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/auth/check-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${publicAnonKey}` },
          body: JSON.stringify({ email: signupEmail }),
        });
        const result = await res.json();
        if (result.exists) { toast.error('이미 가입된 이메일 주소예요. 로그인을 시도해보세요.'); return; }
      } catch (e) {
        console.error('check-email error:', e);
      } finally {
        setIsLoading(false);
      }
    }
    setSignupStep(signupStep + 1);
  };

  const resetSignupForm = () => {
    setSignupStep(1); setPrivacyAgreed(false); setSignupName(''); setSignupPhone('');
    setSignupEmail(''); setSignupPassword(''); setSignupCompleted(false);
    setVerificationCode(''); setEmailVerified(false); setCodeSent(false);
    setSignupNickname('');
  };

  const handleSendVerificationCode = async () => {
    if (!signupEmail.trim()) { toast.error('이메일을 입력해주세요'); return; }
    setSendingCode(true);
    try {
      const sendRes = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/auth/send-verification-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${publicAnonKey}` },
        body: JSON.stringify({ email: signupEmail }),
      });
      const sendResult = await sendRes.json();
      if (!sendRes.ok) {
        if (sendResult.error?.includes('이미 가입')) {
          setEmailDuplicate(true);
          setSendingCode(false);
          return;
        }
        throw new Error(sendResult.error || '인증번호 발송 실패');
      }
      if (sendResult.devCode) {
        toast.info(`인증번호: ${sendResult.devCode}`);
      }
      setCodeSent(true);
      toast.success('인증번호를 이메일로 보냈어요!');
      setResendCooldown(60);
      const timer = setInterval(() => {
        setResendCooldown(prev => {
          if (prev <= 1) { clearInterval(timer); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch (error: any) {
      console.error('send code catch:', error);
      const msg = error.message || '';
      if (msg.includes('rate limit') || msg.includes('60초')) {
        toast.error('잠시 후 다시 시도해주세요. (60초 제한)');
      } else {
        toast.error(msg || '인증번호 발송 실패');
      }
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode.trim()) { toast.error('인증번호를 입력해주세요'); return; }
    if (verificationCode.length !== 6) { toast.error('인증번호는 6자리입니다'); return; }
    setVerifyingCode(true);
    try {
      const verifyRes = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/auth/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${publicAnonKey}` },
        body: JSON.stringify({ email: signupEmail, code: verificationCode }),
      });
      const verifyResult = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyResult.error || '인증번호가 일치하지 않아요');
      setEmailVerified(true);
      toast.success('이메일 인증이 완료되었어요!');
    } catch (error: any) {
      toast.error(error.message || '인증번호가 일치하지 않아요');
    } finally {
      setVerifyingCode(false);
    }
  };

  // ────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── LOGIN VIEW ── */}
      {view === 'login' && (
        <Card className="border-0 shadow-none">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <img src={logoImage} alt="BOARDRAUM" className="h-10 w-auto" />
            </div>
            <CardDescription>로그인하여 컬렉션을 관리하세요</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">이메일</Label>
                <Input id="login-email" type="email" placeholder="example@email.com"
                  value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} disabled={isLoading} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">비밀번호</Label>
                <Input id="login-password" type="password" placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => { setLoginPassword(e.target.value); setLoginError(''); }}
                  disabled={isLoading} required
                  className={loginError ? 'border-red-400 focus-visible:ring-red-300' : ''} />
              </div>
              {loginError && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 text-sm text-red-500 bg-red-50 px-3 py-2 rounded-xl">
                    <span>⚠️</span>
                    <span>{loginError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        localStorage.removeItem('supabase-auth-token');
                        localStorage.removeItem('supabase-migration-done');
                        await supabase.auth.signOut().catch(() => {});
                        setLoginError('');
                        window.location.reload();
                      } catch {}
                    }}
                    className="text-xs text-orange-500 hover:text-orange-700 underline text-center"
                  >
                    계속 안 되면 여기를 눌러 세션 초기화 후 재시도
                  </button>
                </div>
              )}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />로그인 중...</> : <><LogIn className="w-4 h-4 mr-2" />로그인</>}
              </Button>
              <div className="text-center">
                <button type="button"
                  onClick={() => { setView('forgot'); setForgotEmail(loginEmail); setForgotSent(false); setForgotError(''); }}
                  className="text-xs text-gray-400 hover:text-cyan-500 transition-colors">
                  비밀번호를 잊으셨나요?
                </button>
              </div>
              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
                <div className="relative flex justify-center text-xs"><span className="bg-white px-2 text-gray-500">계정이 없으신가요?</span></div>
              </div>
              <Button type="button" variant="outline" className="w-full" onClick={() => setView('signup')} disabled={isLoading}>
                <UserPlus className="w-4 h-4 mr-2" />이메일로 회원가입
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── FORGOT PASSWORD VIEW ── */}
      {view === 'forgot' && (
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <button type="button" onClick={() => setView('login')} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h3 className="font-bold text-gray-900">비밀번호 재설정</h3>
          </div>
          {forgotSent ? (
            <div className="text-center py-4 space-y-3">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
              <p className="font-semibold text-gray-900">메일을 보냈어요!</p>
              <p className="text-sm text-gray-500">
                <span className="font-medium text-gray-700">{forgotEmail}</span><br />
                로 재설정 링크를 보냈어요.<br />
                메일함을 확인해주세요 😊
              </p>
              <p className="text-xs text-gray-400">스팸함도 확인해보세요</p>
              <Button className="w-full mt-2" onClick={() => setView('login')}>확인</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">가입한 이메일로 재설정 링크를 보내드려요</p>
              <div className="space-y-2">
                <Label>가입한 이메일</Label>
                <Input type="email" placeholder="example@email.com"
                  value={forgotEmail}
                  onChange={e => { setForgotEmail(e.target.value); setForgotError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleForgotPassword()} />
              </div>
              {forgotError && (
                <div className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-xl flex items-center gap-1.5">
                  <span>⚠️</span><span>{forgotError}</span>
                </div>
              )}
              <Button className="w-full" onClick={handleForgotPassword} disabled={forgotLoading}>
                {forgotLoading
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />전송 중...</>
                  : <><Mail className="w-4 h-4 mr-2" />재설정 링크 보내기</>}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── SIGNUP VIEW (inline, no fixed overlay) ── */}
      {view === 'signup' && (
        <Card className="border-0 shadow-none">
          <CardHeader className="text-center pb-2">
            <div className="flex items-center justify-between mb-1">
              <button
                type="button"
                onClick={() => { setView('login'); resetSignupForm(); }}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex flex-col items-center">
                <div className="text-3xl mb-1">🎲</div>
                <CardTitle className="text-xl">회원가입</CardTitle>
              </div>
              <div className="w-8" />
            </div>
            <CardDescription>5단계로 간단하게 가입하세요</CardDescription>
          </CardHeader>
          <CardContent>
            {signupCompleted ? (
              <div className="text-center py-8 space-y-4">
                <div className="text-6xl mb-4">🎉</div>
                <h3 className="text-xl font-bold text-gray-900">회원가입이 완료되었어요!</h3>
                <p className="text-gray-600">
                  이제 로그인하여 보드라움을 이용하실 수 있어요.
                </p>
                <Button
                  onClick={() => { resetSignupForm(); setView('login'); }}
                  className="w-full mt-4"
                >
                  로그인하러 가기
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Progress */}
                <div className="flex items-center justify-center gap-2 mb-4">
                  {[1, 2, 3, 4, 5].map((step) => (
                    <div key={step} className={`h-2 rounded-full transition-all ${
                      step === signupStep ? 'bg-[#00BCD4] w-6' : step < signupStep ? 'bg-[#4DD0E1] w-2' : 'bg-gray-200 w-2'
                    }`} />
                  ))}
                </div>

                {signupStep === 1 && (
                  <div className="space-y-4">
                    <div className="text-center mb-6">
                      <h3 className="text-lg font-semibold text-gray-900">안녕하세요! 먼저 이름을 알려주세요 😊</h3>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-name">이름</Label>
                      <Input id="signup-name" type="text" placeholder="홍길동" value={signupName}
                        onChange={(e) => setSignupName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleNextStep()}
                        disabled={isLoading} />
                    </div>
                    <Button onClick={handleNextStep} className="w-full" disabled={isLoading}>
                      다음 <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                )}

                {signupStep === 2 && (
                  <div className="space-y-4">
                    <div className="text-center mb-6">
                      <h3 className="text-lg font-semibold text-gray-900">사용할 닉네임을 입력해주세요 🎮</h3>
                      <p className="text-xs text-gray-400 mt-1">댓글·게시물에 표시돼요. 없으면 이름(가운데 x) 표시</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-nickname">닉네임 <span className="text-gray-400 text-xs">(선택)</span></Label>
                      <Input id="signup-nickname" type="text" placeholder="보드게임러버" value={signupNickname}
                        onChange={(e) => { setSignupNickname(e.target.value); setNicknameDuplicate(false); }}
                        onKeyDown={(e) => e.key === 'Enter' && handleNextStep()}
                        disabled={isLoading} />
                    </div>
                    {nicknameDuplicate && (
                      <div className="relative">
                        <div className="bg-red-500 text-white text-xs rounded-xl px-3 py-1.5 text-center">
                          이미 사용 중인 닉네임이에요
                        </div>
                        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-red-500" />
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button onClick={() => { setSignupStep(1); setNicknameDuplicate(false); }} variant="outline" className="flex-1" disabled={isLoading}>
                        <ArrowLeft className="w-4 h-4 mr-2" /> 이전
                      </Button>
                      <Button onClick={handleNextStep} className="flex-1" disabled={isLoading}>
                        다음 <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                )}

                {signupStep === 3 && (
                  <div className="space-y-4">
                    <div className="text-center mb-6">
                      <h3 className="text-lg font-semibold text-gray-900">연락 가능한 전화번호를 입력해주세요</h3>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-phone">전화번호</Label>
                      <Input id="signup-phone" type="tel" placeholder="010-1234-5678" value={signupPhone}
                        onChange={(e) => setSignupPhone(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleNextStep()}
                        disabled={isLoading} />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => { setSignupStep(2); setNicknameDuplicate(false); setEmailDuplicate(false); }} variant="outline" className="flex-1" disabled={isLoading}>
                        <ArrowLeft className="w-4 h-4 mr-2" /> 이전
                      </Button>
                      <Button onClick={handleNextStep} className="flex-1" disabled={isLoading}>
                        다음 <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                )}

                {signupStep === 4 && (
                  <div className="space-y-4">
                    <div className="text-center mb-6">
                      <h3 className="text-lg font-semibold text-gray-900">이메일 인증을 완료해주세요 📧</h3>
                      <p className="text-xs text-gray-500 mt-1">인증번호가 메일로 발송됩니다</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">이메일</Label>
                      <div className="flex gap-2">
                        <Input
                          id="signup-email"
                          type="email"
                          placeholder="example@email.com"
                          value={signupEmail}
                          onChange={(e) => {
                            setSignupEmail(e.target.value);
                            setCodeSent(false);
                            setEmailVerified(false);
                            setVerificationCode('');
                            setEmailDuplicate(false);
                          }}
                          disabled={isLoading || emailVerified}
                          className="flex-1"
                        />
                        <div className="relative flex-shrink-0">
                          {emailDuplicate && (
                            <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap">
                              <div className="bg-red-500 text-white text-xs rounded-xl px-3 py-1.5 text-center">
                                이미 가입된 이메일이에요
                              </div>
                              <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-red-500" />
                            </div>
                          )}
                          <Button
                            type="button"
                            onClick={handleSendVerificationCode}
                            disabled={sendingCode || emailVerified || !signupEmail.trim() || resendCooldown > 0}
                            variant={emailVerified ? "outline" : "default"}
                            className="whitespace-nowrap"
                          >
                            {emailVerified ? (
                              <><CheckCircle className="w-4 h-4 mr-1" />인증완료</>
                            ) : sendingCode ? (
                              <><Loader2 className="w-4 h-4 mr-1 animate-spin" />전송중</>
                            ) : codeSent ? (
                              resendCooldown > 0 ? `재전송 (${resendCooldown}초)` : '재전송'
                            ) : (
                              '인증하기'
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {codeSent && !emailVerified && (
                      <div className="space-y-2 animate-in slide-in-from-top">
                        <Label htmlFor="verification-code">인증번호 (6자리)</Label>
                        <div className="flex gap-2">
                          <Input
                            id="verification-code"
                            type="text"
                            placeholder="000000"
                            value={verificationCode}
                            onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            onKeyDown={(e) => e.key === 'Enter' && handleVerifyCode()}
                            maxLength={6}
                            className="flex-1 text-center text-lg tracking-wider"
                            autoFocus
                          />
                          <Button
                            type="button"
                            onClick={handleVerifyCode}
                            disabled={verifyingCode || verificationCode.length !== 6}
                          >
                            {verifyingCode ? (
                              <><Loader2 className="w-4 h-4 mr-1 animate-spin" />확인중</>
                            ) : '확인'}
                          </Button>
                        </div>
                        <p className="text-xs text-gray-500">메일함을 확인하여 6자리 인증번호를 입력해주세요</p>
                      </div>
                    )}

                    {emailVerified && (
                      <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2">
                        <CheckCircle className="w-4 h-4" />
                        <span>이메일 인증이 완료되었어요!</span>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        onClick={() => {
                          setSignupStep(3);
                          setCodeSent(false);
                          setEmailVerified(false);
                          setVerificationCode('');
                        }}
                        variant="outline"
                        className="flex-1"
                        disabled={isLoading}
                      >
                        <ArrowLeft className="w-4 h-4 mr-2" /> 이전
                      </Button>
                      <Button
                        type="button"
                        onClick={handleNextStep}
                        className="flex-1"
                        disabled={isLoading || !emailVerified}
                      >
                        다음 <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                )}

                {signupStep === 5 && (
                  <form onSubmit={handleSignup} className="space-y-4">
                    <div className="text-center mb-6">
                      <h3 className="text-lg font-semibold text-gray-900">비밀번호를 설정해주세요 🔐</h3>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">비밀번호</Label>
                      <Input id="signup-password" type="password" placeholder="••••••••" value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)} disabled={isLoading} />
                      <p className="text-xs text-gray-500">최소 6자 이상</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-referral" className="flex items-center gap-1">
                        추천인 코드 <span className="text-gray-400 text-xs">(선택)</span>
                      </Label>
                      <Input id="signup-referral" type="text" placeholder="추천인 코드 6자리" value={referralCode}
                        onChange={(e) => setReferralCode(e.target.value)} disabled={isLoading}
                        style={{ fontSize: '16px' }} />
                      <p className="text-xs text-gray-400">추천인과 함께 보너스카드 혜택을 받아요 🃏</p>
                    </div>
                    {/* 개인정보 동의 */}
                    <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input type="checkbox" checked={privacyAgreed} onChange={e => setPrivacyAgreed(e.target.checked)}
                          className="mt-0.5 w-4 h-4 accent-[#00BCD4]" />
                        <span className="text-xs text-gray-700">
                          <span className="font-semibold text-red-500">[필수]</span> 개인정보 수집·이용에 동의합니다.{' '}
                          <button type="button" onClick={() => setShowPrivacyModal(true)}
                            className="text-[#00BCD4] underline font-medium">개인정보 처리방침 보기</button>
                        </span>
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        onClick={() => setSignupStep(4)}
                        variant="outline"
                        className="flex-1"
                        disabled={isLoading}
                      >
                        <ArrowLeft className="w-4 h-4 mr-2" /> 이전
                      </Button>
                      {/* type="submit" only — onClick 제거하여 이중 호출 방지 */}
                      <Button type="submit" className="flex-1" disabled={isLoading}>
                        {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />가입 중...</> : <><UserPlus className="w-4 h-4 mr-2" />가입 완료</>}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 개인정보처리방침 모달 (fixed, z-[9999]) ── */}
      {showPrivacyModal && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4" onClick={() => setShowPrivacyModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">개인정보 처리방침</h2>
              <button onClick={() => setShowPrivacyModal(false)} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-5 py-4 text-xs text-gray-700 space-y-4 leading-relaxed">
              <p className="text-gray-500 text-[11px]">시행일: 2026년 4월 6일</p>

              <section>
                <h3 className="font-bold text-gray-900 mb-1">제1조 (개인정보의 수집·이용 목적)</h3>
                <p>보드라움(이하 "서비스")은 다음의 목적을 위해 개인정보를 수집·이용합니다.</p>
                <ul className="list-disc pl-4 mt-1 space-y-0.5">
                  <li>회원 가입 및 본인 확인</li>
                  <li>서비스 제공 및 운영</li>
                  <li>고객 문의 및 불만 처리</li>
                  <li>서비스 개선 및 신규 서비스 개발</li>
                </ul>
              </section>

              <section>
                <h3 className="font-bold text-gray-900 mb-1">제2조 (수집하는 개인정보 항목)</h3>
                <p><span className="font-semibold">필수항목:</span> 이름, 이메일 주소, 비밀번호, 전화번호</p>
                <p className="mt-1"><span className="font-semibold">자동수집항목:</span> 서비스 이용 기록, 접속 로그, IP 주소</p>
              </section>

              <section>
                <h3 className="font-bold text-gray-900 mb-1">제3조 (개인정보의 보유·이용 기간)</h3>
                <p>회원 탈퇴 시까지 보유·이용합니다. 단, 관계 법령에 따라 일정 기간 보존이 필요한 경우 해당 기간 동안 보관합니다.</p>
                <ul className="list-disc pl-4 mt-1 space-y-0.5">
                  <li>전자상거래 기록: 5년 (전자상거래법)</li>
                  <li>접속 로그: 3개월 (통신비밀보호법)</li>
                </ul>
              </section>

              <section>
                <h3 className="font-bold text-gray-900 mb-1">제4조 (개인정보의 제3자 제공)</h3>
                <p>서비스는 이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다. 단, 법령에 의거하거나 수사기관의 요청이 있는 경우는 예외로 합니다.</p>
              </section>

              <section>
                <h3 className="font-bold text-gray-900 mb-1">제5조 (개인정보의 파기)</h3>
                <p>보유 기간 만료 또는 처리 목적 달성 시 지체 없이 파기합니다. 전자적 파일은 복구 불가한 방법으로 삭제하며, 인쇄물은 분쇄 또는 소각합니다.</p>
              </section>

              <section>
                <h3 className="font-bold text-gray-900 mb-1">제6조 (이용자의 권리)</h3>
                <p>이용자는 언제든지 다음의 권리를 행사할 수 있습니다.</p>
                <ul className="list-disc pl-4 mt-1 space-y-0.5">
                  <li>개인정보 열람 요구</li>
                  <li>오류 정정 요구</li>
                  <li>삭제 요구</li>
                  <li>처리 정지 요구</li>
                </ul>
                <p className="mt-1">문의: sityplanner2@naver.com</p>
              </section>

              <section>
                <h3 className="font-bold text-gray-900 mb-1">제7조 (개인정보 보호책임자)</h3>
                <p>개인정보 처리에 관한 업무를 담당하는 책임자는 아래와 같습니다.</p>
                <ul className="list-disc pl-4 mt-1 space-y-0.5">
                  <li>성명: 보드라움 운영팀</li>
                  <li>이메일: sityplanner2@naver.com</li>
                </ul>
              </section>

              <section>
                <h3 className="font-bold text-gray-900 mb-1">제8조 (개인정보 침해 신고·상담)</h3>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>개인정보 침해신고센터: privacy.kisa.or.kr / 118</li>
                  <li>개인정보 분쟁조정위원회: www.kopico.go.kr / 1833-6972</li>
                  <li>대검찰청 사이버수사과: www.spo.go.kr / 1301</li>
                  <li>경찰청 사이버수사국: ecrm.cyber.go.kr / 182</li>
                </ul>
              </section>
              <section>
                <h3 className="font-bold text-gray-900 mb-1">제9조 (광고성 정보 수신 동의)</h3>
                <p>이벤트·혜택·신규 서비스 안내 등 광고성 정보는 이용자가 별도로 동의한 경우에만 발송합니다.</p>
                <ul className="list-disc pl-4 mt-1 space-y-0.5">
                  <li>수신 동의: 가입 시 또는 마이페이지 설정에서 선택 가능</li>
                  <li>수신 거부: 언제든지 sityplanner2@naver.com으로 요청하거나 메일 하단 수신거부 링크를 이용</li>
                  <li>광고성 메일 제목에는 반드시 <b>(광고)</b> 표시를 포함합니다</li>
                </ul>
              </section>
            </div>
            <div className="px-5 py-4 border-t border-gray-100">
              <button onClick={() => { setPrivacyAgreed(true); setShowPrivacyModal(false); }}
                className="w-full py-2.5 bg-[#00BCD4] text-white text-sm font-semibold rounded-xl hover:bg-[#00ACC1] transition-colors">
                동의하고 닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
