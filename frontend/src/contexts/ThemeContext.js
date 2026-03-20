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
        palette: {
          mode,
          primary: {
            main: mode === 'light' ? '#3B5CCC' : '#9EB4FF',
          },
          secondary: {
            main: mode === 'light' ? '#5E76BD' : '#BFD0FF',
          },
          background: {
            default: mode === 'light' ? '#EFF3FA' : '#0D111B',
            paper: mode === 'light' ? '#FFFFFF' : '#171C2A',
            sidebar: mode === 'light' ? '#F5F8FF' : '#121827',
            chat: mode === 'light' ? '#F4F7FE' : '#121827',
          },
          text: {
            primary: mode === 'light' ? '#131C2E' : '#E8EEFF',
            secondary: mode === 'light' ? '#62708E' : '#A7B5D5',
          },
          divider: mode === 'light' ? '#DEE6F6' : '#2A334A',
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
                '& fieldset': {
                  border: 'none',
                },
              },
            },
          },
          MuiPaper: {
            styleOverrides: {
              root: {
                borderRadius: '16px',
                backgroundImage: 'none',
                border: 'none',
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
                backgroundImage: 'none',
                border: 'none',
              },
            },
          },
          MuiDialog: {
            styleOverrides: {
              paper: {
                border: 'none',
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
