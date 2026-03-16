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
            main: mode === 'light' ? '#A0522D' : '#D2B48C', // 更柔和的褐色
          },
          secondary: {
            main: mode === 'light' ? '#CD853F' : '#DEB887', // 珊瑚色
          },
          background: {
            default: mode === 'light' ? '#F5F0E6' : '#2C2213', // 更柔和的小麦色/深褐色背景
            paper: mode === 'light' ? '#FFFDF8' : '#3D2F19', // 更柔和的纸张色
            sidebar: mode === 'light' ? '#F8F4EC' : '#352A18', // 更柔和的侧边栏
            chat: mode === 'light' ? '#F8F4EC' : '#352A18', // 更柔和的聊天区
          },
          text: {
            primary: mode === 'light' ? '#5D4037' : '#F5E9D2', // 更柔和的深褐色/米色文字
            secondary: mode === 'light' ? '#8D6E63' : '#DCC9A8', // 更柔和的次要文字
          },
          divider: mode === 'light' ? '#D7CCC8' : '#5D4E44', // 更柔和的分隔线
          // 武林外传角色颜色 (更柔和的版本)
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
            '"Microsoft YaHei"',
            '"SimHei"',
            '"KaiTi"',
            'STKaiti',
            'serif',
          ].join(','),
          // 武林外传特色字体样式
          h6: {
            fontFamily: '"KaiTi", "STKaiti", serif',
            fontWeight: 'bold',
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
          // 武林外传风格按钮
          MuiButton: {
            styleOverrides: {
              root: {
                borderRadius: '20px',
                textTransform: 'none',
                fontFamily: '"KaiTi", "STKaiti", serif',
                fontWeight: 'bold',
              },
              contained: {
                boxShadow: 'none',
                '&:hover': {
                  boxShadow: 'none',
                },
              },
            },
          },
          // 武林外传风格输入框
          MuiTextField: {
            styleOverrides: {
              root: {
                '& .MuiOutlinedInput-root': {
                  borderRadius: '20px',
                },
              },
            },
          },
          // 武林外传风格卡片
          MuiPaper: {
            styleOverrides: {
              root: {
                borderRadius: '12px',
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
