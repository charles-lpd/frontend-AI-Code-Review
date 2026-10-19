import { create } from 'zustand';

interface LoginDialogState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

/** 登录弹窗的开关，全局唯一，任何登录入口都通过它打开弹窗。 */
export const useLoginDialogStore = create<LoginDialogState>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
