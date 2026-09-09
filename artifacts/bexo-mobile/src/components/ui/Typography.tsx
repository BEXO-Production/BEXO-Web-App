import { Text, type TextProps, type TextStyle } from "react-native";
import { useTheme } from "@/lib/theme-context";
import { fonts } from "@/lib/fonts";

/**
 * Typography lifted verbatim from the design canvas
 * (`BEXO Mobile App(1)/BEXO Mobile v2.dc.html`). Sizes/leading/tracking match
 * the CSS there, so screens compose these rather than restating font styles.
 */

type Props = TextProps & { style?: TextStyle | TextStyle[] };

/** 10.5px / 700 / 2px tracking / uppercase / accentSoft — the "Step 1 of 9" label. */
export function Eyebrow({ style, ...rest }: Props) {
  const { c } = useTheme();
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: fonts.sans700,
          fontSize: 10.5,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: c.accentSoft,
        },
        style,
      ]}
    />
  );
}

/** Playfair Display 600, 34/39, -0.9 tracking — every screen's headline. */
export function Display({ style, ...rest }: Props) {
  const { c } = useTheme();
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: fonts.serif600,
          fontSize: 34,
          lineHeight: 39,
          letterSpacing: -0.9,
          color: c.ink,
        },
        style,
      ]}
    />
  );
}

/** The italic, accent-coloured second line of a Display headline. */
export function DisplayAccent({ style, ...rest }: Props) {
  const { c } = useTheme();
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: fonts.serif600Italic,
          fontSize: 34,
          lineHeight: 39,
          letterSpacing: -0.9,
          color: c.accentSoft,
        },
        style,
      ]}
    />
  );
}

/** 15.5/24 muted — the paragraph under a headline. */
export function Body({ style, ...rest }: Props) {
  const { c } = useTheme();
  return (
    <Text
      {...rest}
      style={[
        { fontFamily: fonts.sans400, fontSize: 15.5, lineHeight: 24, color: c.muted },
        style,
      ]}
    />
  );
}

/** 12.5/19 muted — helper text inside cards. */
export function Caption({ style, ...rest }: Props) {
  const { c } = useTheme();
  return (
    <Text
      {...rest}
      style={[
        { fontFamily: fonts.sans400, fontSize: 12.5, lineHeight: 19, color: c.muted },
        style,
      ]}
    />
  );
}

/** 12.5px / 600 muted — form field labels. */
export function Label({ style, ...rest }: Props) {
  const { c } = useTheme();
  return (
    <Text
      {...rest}
      style={[
        { fontFamily: fonts.sans600, fontSize: 12.5, letterSpacing: 0.2, color: c.muted },
        style,
      ]}
    />
  );
}
