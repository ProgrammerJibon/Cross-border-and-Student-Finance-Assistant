import { SiPaypal, SiVisa, SiStripe, SiAlipay, SiWechat } from "react-icons/si";
export function PaymentLogo({ method }: { method: string }) {
  if (method.toUpperCase() === "STRIPE") return <SiStripe className="payment-logo" color="#635bff" aria-hidden="true" />;
  if (method.toUpperCase() === "ALIPAY") return <SiAlipay className="payment-logo" color="#1677ff" aria-hidden="true" />;
  if (["WECHAT", "WECHAT PAY"].includes(method.toUpperCase())) return <SiWechat className="payment-logo" color="#09b83e" aria-hidden="true" />;
  if (method.toUpperCase() === "PAYPAL")
    return (
      <SiPaypal className="payment-logo" color="#0070ba" aria-hidden="true" />
    );
  if (method.toUpperCase() === "VISA")
    return (
      <SiVisa className="payment-logo" color="#1434cb" aria-hidden="true" />
    );
  return (
    <svg
      className="payment-logo"
      viewBox="0 0 60 36"
      aria-hidden="true"
      focusable="false"
    >
      {method.toUpperCase() === "MASTERCARD" ? (
        <>
          <circle cx="23" cy="18" r="15" fill="#eb001b" />
          <circle cx="39" cy="18" r="15" fill="#f79e1b" />
          <path
            d="M31 5.3a15 15 0 0 1 0 25.4 15 15 0 0 1 0-25.4"
            fill="#ff5f00"
          />
        </>
      ) : (
        <>
          <path d="M9 2h19L19 34H0z" fill="#e21836" />
          <path d="M28 2h17l-9 32H19z" fill="#00447c" />
          <path d="M45 2h15l-9 32H36z" fill="#007b84" />
          <text
            x="8"
            y="18"
            fill="white"
            fontSize="10"
            fontFamily="Arial,sans-serif"
            fontWeight="bold"
          >
            UnionPay
          </text>
          <text x="22" y="29" fill="white" fontSize="9">
            银联
          </text>
        </>
      )}
    </svg>
  );
}
