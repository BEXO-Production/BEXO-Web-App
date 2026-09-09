import { memo } from "react";
import QRCodeSvg from "react-native-qrcode-svg";

/**
 * A real, scannable QR code.
 *
 * It encodes the card URL the server minted (`user.cardUrl` —
 * `https://<app>/c/<cardCode>`), so any phone camera opens that person's
 * portfolio, while BEXO's own scanner recognises the code inside it and turns
 * the scan into a connection request. Error correction is set high because
 * these get printed on cards and covered by the logo badge in the middle.
 */
export const QrCode = memo(function QrCode({
  value,
  size,
  color = "#16171B",
  backgroundColor = "transparent",
}: {
  value: string;
  size: number;
  color?: string;
  backgroundColor?: string;
}) {
  return (
    <QRCodeSvg
      value={value || "https://atbexo.com"}
      size={size}
      color={color}
      backgroundColor={backgroundColor}
      ecl="H"
      quietZone={0}
    />
  );
});
