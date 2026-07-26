/**
 * Typography —— 戏文可读 + UI 清晰（DS2）。
 *
 *  字号阶梯走 8pt grid；叙事字体 Noto Serif SC，UI 字体 Source Han Sans SC。
 *  叙事栏宽度 28-36em（32-40 字/行）；lineHeight relaxed（1.75）保证可读。
 *
 * 组件：
 *  - Display  5xl/4xl/3xl — 戏台标题、章回名
 *  - Heading  2xl/xl/lg — 面板标题
 *  - Title    xl — 卡片标题
 *  - Body     base — 正文（默认）
 *  - BodyStrong / BodyMuted — 强调/次要正文
 *  - Caption  sm/xs — 注释、徽章
 *  - Quote    戏文引述（带左金线）
 *  - Code     等宽（用于 debug / 内部调试）
 *  - Narrative 专属排版（serif，1.75 行高，限宽 36em）
 */
import type { CSSProperties, ElementType, ReactNode } from 'react';
import { tokens } from '../tokens';

type Tone = 'primary' | 'secondary' | 'muted' | 'inverse' | 'lacquer' | 'lantern' | 'inherit';

const TONE_TO_VAR: Record<Tone, string> = {
  primary: 'var(--color-text-primary)',
  secondary: 'var(--color-text-secondary)',
  muted: 'var(--color-text-muted)',
  inverse: 'var(--color-text-inverse)',
  lacquer: 'var(--color-brand-lacquer)',
  lantern: 'var(--color-brand-lantern)',
  inherit: 'inherit',
};

interface BaseProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  id?: string;
  title?: string;
}

interface TypographyProps extends BaseProps {
  tone?: Tone;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  align?: 'left' | 'center' | 'right';
  truncate?: boolean;
  italic?: boolean;
  as?: ElementType;
}

function pickSizeVar(
  size: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl',
): string {
  return `var(${tokens.text.size[size]})`;
}

function pickWeightVar(w: NonNullable<TypographyProps['weight']>): string {
  return `var(${tokens.text.weight[w]})`;
}

function pickLineHeightVar(w: 'tight' | 'snug' | 'normal' | 'relaxed'): string {
  return `var(${tokens.text.lineHeight[w]})`;
}

function baseStyle(p: TypographyProps, defaults: CSSProperties): CSSProperties {
  const tone = p.tone ?? 'primary';
  return {
    margin: 0,
    color: TONE_TO_VAR[tone],
    fontWeight: pickWeightVar(p.weight ?? 'regular'),
    textAlign: p.align,
    fontStyle: p.italic ? 'italic' : 'normal',
    overflow: p.truncate ? 'hidden' : undefined,
    textOverflow: p.truncate ? 'ellipsis' : undefined,
    whiteSpace: p.truncate ? 'nowrap' : undefined,
    ...defaults,
    ...p.style,
  };
}

/* ============================================================
 * Display —— 章回级标题
 * ============================================================ */
export interface DisplayProps extends TypographyProps {
  size?: '3xl' | '4xl' | '5xl';
}

export function Display({ size = '4xl', ...rest }: DisplayProps) {
  const Tag = rest.as ?? 'h1';
  return (
    <Tag
      className={rest.className}
      style={baseStyle(rest, {
        fontFamily: 'var(--font-serif)',
        fontSize: pickSizeVar(size),
        lineHeight: pickLineHeightVar('tight'),
        letterSpacing: 'var(--text-letter-tight)',
        fontWeight: pickWeightVar('bold'),
      })}
      id={rest.id}
      title={rest.title}
    >
      {rest.children}
    </Tag>
  );
}

/* ============================================================
 * Heading —— 面板标题
 * ============================================================ */
export interface HeadingProps extends TypographyProps {
  size?: 'lg' | 'xl' | '2xl' | '3xl';
}

export function Heading({ size = '2xl', ...rest }: HeadingProps) {
  const Tag = rest.as ?? 'h2';
  return (
    <Tag
      className={rest.className}
      style={baseStyle(rest, {
        fontFamily: 'var(--font-ui)',
        fontSize: pickSizeVar(size),
        lineHeight: pickLineHeightVar('snug'),
        fontWeight: pickWeightVar('semibold'),
      })}
      id={rest.id}
      title={rest.title}
    >
      {rest.children}
    </Tag>
  );
}

/* ============================================================
 * Title —— 卡片标题
 * ============================================================ */
export function Title({ ...rest }: TypographyProps) {
  const Tag = rest.as ?? 'h3';
  return (
    <Tag
      className={rest.className}
      style={baseStyle(rest, {
        fontFamily: 'var(--font-ui)',
        fontSize: pickSizeVar('xl'),
        lineHeight: pickLineHeightVar('snug'),
        fontWeight: pickWeightVar('semibold'),
      })}
      id={rest.id}
      title={rest.title}
    >
      {rest.children}
    </Tag>
  );
}

/* ============================================================
 * Body —— 正文
 * ============================================================ */
export interface BodyProps extends TypographyProps {
  size?: 'sm' | 'base' | 'lg';
}

export function Body({ size = 'base', ...rest }: BodyProps) {
  const Tag = rest.as ?? 'p';
  return (
    <Tag
      className={rest.className}
      style={baseStyle(rest, {
        fontFamily: 'var(--font-ui)',
        fontSize: pickSizeVar(size),
        lineHeight: pickLineHeightVar('normal'),
      })}
      id={rest.id}
      title={rest.title}
    >
      {rest.children}
    </Tag>
  );
}

export function BodyStrong(props: TypographyProps) {
  return <Body {...props} weight="semibold" />;
}

export function BodyMuted(props: TypographyProps) {
  return <Body {...props} tone="muted" />;
}

/* ============================================================
 * Caption —— 注释 / 徽章
 * ============================================================ */
export interface CaptionProps extends TypographyProps {
  size?: 'xs' | 'sm';
}

export function Caption({ size = 'sm', ...rest }: CaptionProps) {
  const Tag = rest.as ?? 'span';
  return (
    <Tag
      className={rest.className}
      style={baseStyle(rest, {
        fontFamily: 'var(--font-ui)',
        fontSize: pickSizeVar(size),
        lineHeight: pickLineHeightVar('normal'),
        letterSpacing: 'var(--text-letter-wide)',
        fontWeight: pickWeightVar('medium'),
      })}
      id={rest.id}
      title={rest.title}
    >
      {rest.children}
    </Tag>
  );
}

/* ============================================================
 * Quote —— 戏文引述（左金线 + serif + relaxed）
 * ============================================================ */
export interface QuoteProps extends TypographyProps {
  cite?: string;
}

export function Quote({ cite, ...rest }: QuoteProps) {
  return (
    <blockquote
      className={rest.className}
      style={baseStyle(
        { ...rest, tone: rest.tone ?? 'primary' },
        {
          fontFamily: 'var(--font-serif)',
          fontSize: pickSizeVar('lg'),
          lineHeight: pickLineHeightVar('relaxed'),
          paddingLeft: 'var(--size-spacing-4)',
          marginLeft: 0,
          marginRight: 0,
          borderLeft: '2px solid var(--color-brand-lantern)',
          fontStyle: 'italic',
        },
      )}
      cite={cite}
      id={rest.id}
      title={rest.title}
    >
      {rest.children}
      {cite ? (
        <footer
          style={{
            marginTop: 'var(--size-spacing-2)',
            fontSize: pickSizeVar('sm'),
            color: 'var(--color-text-muted)',
            fontStyle: 'normal',
          }}
        >
          —— {cite}
        </footer>
      ) : null}
    </blockquote>
  );
}

/* ============================================================
 * Code —— 等宽
 * ============================================================ */
export interface CodeProps extends TypographyProps {
  size?: 'xs' | 'sm' | 'base';
  /** inline = 行内 <code>；block = 块级 <pre>。 */
  block?: boolean;
}

export function Code({ size = 'sm', block = false, ...rest }: CodeProps) {
  const styles: CSSProperties = baseStyle(
    { ...rest, tone: rest.tone ?? 'secondary' },
    {
      fontFamily: 'var(--font-mono)',
      fontSize: pickSizeVar(size),
      lineHeight: pickLineHeightVar('snug'),
      background: 'var(--color-surface-2)',
      padding: block ? 'var(--size-spacing-3)' : '0 var(--size-spacing-1)',
      borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--color-border-subtle)',
      overflow: 'auto',
      display: block ? 'block' : 'inline',
    },
  );
  if (block) {
    return (
      <pre className={rest.className} style={styles} id={rest.id} title={rest.title}>
        {rest.children}
      </pre>
    );
  }
  return (
    <code className={rest.className} style={styles} id={rest.id} title={rest.title}>
      {rest.children}
    </code>
  );
}

/* ============================================================
 * Narrative —— 叙事栏专用排版（serif + 1.75 + 限宽）
 * ============================================================ */
export interface NarrativeProps extends TypographyProps {
  /** 是否启用限宽（默认开启）；32-40 字/行（36em）。 */
  constrained?: boolean;
}

export function Narrative({ constrained = true, ...rest }: NarrativeProps) {
  const Tag = rest.as ?? 'div';
  return (
    <Tag
      className={rest.className}
      style={baseStyle(
        { ...rest, tone: rest.tone ?? 'primary' },
        {
          fontFamily: 'var(--font-serif)',
          fontSize: pickSizeVar('lg'),
          lineHeight: pickLineHeightVar('relaxed'),
          maxWidth: constrained ? '36em' : undefined,
          minWidth: constrained ? '28em' : undefined,
          textAlign: 'justify',
          hangingPunctuation: 'first last',
          fontFeatureSettings: '"palt"',
        },
      )}
      id={rest.id}
      title={rest.title}
    >
      {rest.children}
    </Tag>
  );
}

/* ============================================================
 * Label —— 表单 / 控件标签
 * ============================================================ */
export interface LabelProps extends BaseProps {
  tone?: Tone;
  /** 是否必填（红星）。 */
  required?: boolean;
  htmlFor?: string;
}

export function Label({ tone = 'secondary', required, htmlFor, ...rest }: LabelProps) {
  return (
    <label
      htmlFor={htmlFor}
      className={rest.className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--size-spacing-1)',
        fontFamily: 'var(--font-ui)',
        fontSize: pickSizeVar('sm'),
        lineHeight: pickLineHeightVar('snug'),
        fontWeight: pickWeightVar('medium'),
        color: TONE_TO_VAR[tone],
        ...rest.style,
      }}
      id={rest.id}
      title={rest.title}
    >
      {rest.children}
      {required ? (
        <span aria-hidden style={{ color: 'var(--color-brand-lacquer)' }}>
          *
        </span>
      ) : null}
    </label>
  );
}

/* ============================================================
 * 工具 hook —— 让任何组件都走同一份 token 字体
 * ============================================================ */
export function useTypographyFamily(kind: 'ui' | 'serif' | 'mono' = 'ui'): string {
  return `var(${tokens.font[kind]})`;
}
