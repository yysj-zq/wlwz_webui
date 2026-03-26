import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { createTheme, ThemeProvider as MuiThemeProvider } from '@mui/material/styles';

const ThemeContext = createContext();

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }) => {
  const [mode, setMode] = useState(() => {
    const savedMode = localStorage.getItem('themeMode');
    return savedMode || 'light';
  });

  const toggleMode = () => {
    const newMode = mode === 'light' ? 'dark' : 'light';
    setMode(newMode);
    localStorage.setItem('themeMode', newMode);
  };

  const theme = useMemo(
    () =>
      createTheme({
        shape: {
          borderRadius: 16,
        },
        palette: {
          mode,
          primary: {
            main: mode === 'light' ? '#3B5CCC' : '#D6B25E',
            light: mode === 'light' ? '#6E86E6' : '#F2D48A',
            dark: mode === 'light' ? '#2844A6' : '#B8943F',
            contrastText: mode === 'light' ? '#F6F9FF' : '#1A1307',
          },
          secondary: {
            main: mode === 'light' ? '#5E76BD' : '#E6C987',
          },
          background: {
            default: mode === 'light' ? '#EFF3FA' : '#0B0C0F',
            paper: mode === 'light' ? '#FFFFFF' : '#141315',
            sidebar: mode === 'light' ? '#F5F8FF' : '#101012',
            chat: mode === 'light' ? '#F4F7FE' : '#101012',
          },
          text: {
            primary: mode === 'light' ? '#131C2E' : '#F3EFE7',
            secondary: mode === 'light' ? '#62708E' : '#B8AFA2',
          },
          divider: mode === 'light' ? '#DEE6F6' : '#2A2520',
          tongxiangyu: '#B71C1C', // 佟湘玉 - 深红色
          baizhantang: '#1565C0', // 白展堂 - 皇家蓝
          guofurong: '#C2185B', // 郭芙蓉 - 玫瑰红
          lidazui: '#6A1B9A', // 李大嘴 - 紫色
          lvxiucai: '#388E3C', // 吕秀才 - 绿色
          moxiaobei: '#E91E63', // 莫小贝 - 粉红
          yanxiaoliu: '#0277BD', // 燕小六 - 海军蓝
          zhuwushuang: '#FFB300', // 祝无双 - 金色
          xingyusen: '#616161', // 邢育森 - 灰色
        },
        typography: {
          fontFamily: [
            '"Instrument Sans"',
            '"Noto Sans SC"',
            'serif',
          ].join(','),
          h6: {
            fontFamily: '"Instrument Sans", "Noto Sans SC", sans-serif',
            fontWeight: 700,
          },
        },
        components: {
          MuiCssBaseline: {
            styleOverrides: {
              body: {
                scrollbarWidth: 'thin',
                backgroundColor: mode === 'dark' ? '#0B0C0F' : undefined,
                '&::-webkit-scrollbar': {
                  width: '0.6em',
                },
                '&::-webkit-scrollbar-track': {
                  background: mode === 'light' ? '#F5DEB3' : '#8B4513',
                },
                '&::-webkit-scrollbar-thumb': {
                  backgroundColor: mode === 'light' ? '#D2B48C' : '#CD853F',
                  borderRadius: '0.3em',
                },
                '&::-webkit-scrollbar-thumb:hover': {
                  background: mode === 'light' ? '#CD853F' : '#DEB887',
                },
              },
            },
          },
          MuiButton: {
            styleOverrides: {
              root: {
                borderRadius: '999px',
                textTransform: 'none',
                fontFamily: '"Manrope", "Noto Sans SC", sans-serif',
                fontWeight: 600,
              },
              contained: {
                boxShadow: 'none',
                '&:hover': {
                  boxShadow: 'none',
                },
              },
            },
          },
          MuiChip: {
            styleOverrides: {
              root: {
                borderRadius: 999,
              },
              filled: {
                backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.06)' : undefined,
                border: mode === 'dark' ? '1px solid rgba(255,255,255,0.08)' : undefined,
              },
              outlined: {
                borderColor: mode === 'dark' ? 'rgba(255,255,255,0.12)' : undefined,
              },
            },
          },
          MuiTextField: {
            styleOverrides: {
              root: {
                '& .MuiOutlinedInput-root': {
                  borderRadius: '16px',
                  '& fieldset': {
                    border: 'none',
                  },
                },
              },
            },
          },
          MuiOutlinedInput: {
            styleOverrides: {
              root: {
                backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.04)' : undefined,
                boxShadow: mode === 'dark'
                  ? 'inset 0 0 0 1px rgba(255,255,255,0.10), 0 10px 24px rgba(0,0,0,0.30)'
                  : undefined,
                transition: 'box-shadow 160ms ease, background-color 160ms ease, transform 160ms ease',
                '& fieldset': {
                  border: 'none',
                },
                '&:hover': {
                  boxShadow: mode === 'dark'
                    ? 'inset 0 0 0 1px rgba(255,255,255,0.14), 0 12px 28px rgba(0,0,0,0.34)'
                    : undefined,
                },
                '&.Mui-focused': {
                  boxShadow: mode === 'dark'
                    ? 'inset 0 0 0 1px rgba(214,178,94,0.34), 0 16px 34px rgba(0,0,0,0.40)'
                    : undefined,
                },
              },
            },
          },
          MuiPaper: {
            styleOverrides: {
              root: {
                borderRadius: '16px',
                backgroundImage: mode === 'dark'
                  ? 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.005))'
                  : 'none',
                border: mode === 'dark' ? '1px solid rgba(255,255,255,0.08)' : 'none',
                boxShadow: mode === 'dark'
                  ? '0 18px 44px rgba(0,0,0,0.52), inset 0 1px 0 rgba(255,255,255,0.06)'
                  : undefined,
              },
            },
          },
          MuiAppBar: {
            styleOverrides: {
              root: {
                borderRadius: 0,
                backgroundImage: 'none',
              },
            },
          },
          MuiDrawer: {
            styleOverrides: {
              paper: {
                borderRadius: 0,
                backgroundImage: mode === 'dark'
                  ? 'linear-gradient(180deg, rgba(255,255,255,0.018), rgba(255,255,255,0.004))'
                  : 'none',
                border: mode === 'dark' ? '1px solid rgba(255,255,255,0.08)' : 'none',
                boxShadow: mode === 'dark'
                  ? '0 20px 60px rgba(0,0,0,0.62), inset 0 1px 0 rgba(255,255,255,0.05)'
                  : undefined,
              },
            },
          },
          MuiDialog: {
            styleOverrides: {
              paper: {
                border: mode === 'dark' ? '1px solid rgba(255,255,255,0.10)' : 'none',
                backgroundImage: mode === 'dark'
                  ? 'linear-gradient(180deg, rgba(255,255,255,0.024), rgba(255,255,255,0.006))'
                  : 'none',
                boxShadow: mode === 'dark'
                  ? '0 26px 80px rgba(0,0,0,0.70), inset 0 1px 0 rgba(255,255,255,0.06)'
                  : undefined,
              },
            },
          },
          MuiTabs: {
            styleOverrides: {
              root: {
                minHeight: 40,
              },
              indicator: {
                height: 3,
                borderRadius: 999,
              },
            },
          },
          MuiTab: {
            styleOverrides: {
              root: {
                minHeight: 40,
                borderRadius: 999,
                textTransform: 'none',
              },
            },
          },
        },
      }),
    [mode],
  );

  useEffect(() => {
    document.body.classList.toggle('dark-theme', mode === 'dark');
    document.documentElement.style.colorScheme = mode;
  }, [mode]);

  return (
    <ThemeContext.Provider value={{ mode, toggleMode, theme }}>
      <MuiThemeProvider theme={theme}>{children}</MuiThemeProvider>
    </ThemeContext.Provider>
  );
};
