'use client';

import { useMemo, useState } from 'react';
import { BOOKS } from '@/lib/books';
import { calculateTotals, formatNumber, formatYen, normalizeQuantity, type PaymentSummary } from '@/lib/calc';
import type { FullTableOcrApiSuccess, QuantityRow } from '@/types';
import { ResultSummary } from '@/components/ResultSummary';
import { OcrBarcodeScanner } from '@/components/OcrBarcodeScanner';

const SINGLE_DIGIT_QUANTITIES = Array.from({ length: 9 }, (_, index) => index + 1);
const MANUAL_QUANTITY_VALUE = 'manual';
const MIN_MANUAL_QUANTITY = 10;
const MAX_MANUAL_QUANTITY = 99;

type QuantityReviewProps = {
  rows: QuantityRow[];
  imageDataUrl: string;
  apiMeta: FullTableOcrApiSuccess['meta'] | null;
  targetFound: boolean;
  targetTitle: string;
  warnings: string[];
  onRowsChange: (rows: QuantityRow[]) => void;
  onReset: () => void;
};

function normalizeManualQuantityText(value: string): string {
  return value
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\D/g, '')
    .slice(0, 2);
}

function isValidManualQuantity(value: string): boolean {
  if (!/^\d{2}$/.test(value)) return false;
  const quantity = Number.parseInt(value, 10);
  return quantity >= MIN_MANUAL_QUANTITY && quantity <= MAX_MANUAL_QUANTITY;
}

function hasOwnEntry(record: Record<number, string>, no: number): boolean {
  return Object.prototype.hasOwnProperty.call(record, no);
}

export function QuantityReview({
  rows,
  imageDataUrl,
  apiMeta,
  targetFound,
  targetTitle,
  warnings,
  onRowsChange,
  onReset,
}: QuantityReviewProps) {
  const { totalQuantity, totalAmount } = useMemo(() => calculateTotals(rows), [rows]);
  const quantityByNo = useMemo(() => new Map(rows.map((row) => [row.no, row])), [rows]);
  const [barcodePaymentSummary, setBarcodePaymentSummary] = useState<PaymentSummary | null>(null);
  const [manualQuantityInputs, setManualQuantityInputs] = useState<Record<number, string>>(() => {
    const entries = rows
      .filter((row) => row.quantity >= MIN_MANUAL_QUANTITY)
      .map((row) => [row.no, row.quantity <= MAX_MANUAL_QUANTITY ? String(row.quantity) : ''] as const);
    return Object.fromEntries(entries);
  });

  const hasInvalidManualQuantity = useMemo(
    () => Object.values(manualQuantityInputs).some((value) => !isValidManualQuantity(value)),
    [manualQuantityInputs],
  );

  function setQuantity(no: number, value: string, needsReview = false) {
    const nextQuantity = normalizeQuantity(value);
    onRowsChange(
      rows.map((row) =>
        row.no === no
          ? {
              ...row,
              quantity: nextQuantity,
              raw: value,
              needsReview,
            }
          : row,
      ),
    );
  }

  function selectQuantity(no: number, selectedValue: string) {
    if (selectedValue === MANUAL_QUANTITY_VALUE) {
      const currentQuantity = quantityByNo.get(no)?.quantity ?? 0;
      const initialValue =
        currentQuantity >= MIN_MANUAL_QUANTITY && currentQuantity <= MAX_MANUAL_QUANTITY
          ? String(currentQuantity)
          : String(MIN_MANUAL_QUANTITY);

      setManualQuantityInputs((current) => ({ ...current, [no]: initialValue }));
      setQuantity(no, initialValue);
      return;
    }

    setManualQuantityInputs((current) => {
      if (!hasOwnEntry(current, no)) return current;
      const next = { ...current };
      delete next[no];
      return next;
    });
    setQuantity(no, selectedValue);
  }

  function updateManualQuantity(no: number, value: string) {
    const normalizedValue = normalizeManualQuantityText(value);
    const isValid = isValidManualQuantity(normalizedValue);

    setManualQuantityInputs((current) => ({ ...current, [no]: normalizedValue }));
    setQuantity(no, isValid ? normalizedValue : '0', !isValid);
  }

  if (barcodePaymentSummary) {
    return (
      <OcrBarcodeScanner
        totalAmount={totalAmount}
        totalQuantity={totalQuantity}
        paymentSummary={barcodePaymentSummary}
        onBack={() => setBarcodePaymentSummary(null)}
        onStartOver={onReset}
      />
    );
  }

  return (
    <section className="card review-card">
      <div className="screen-header">
        <div>
          <div className="hero-eyebrow">確認・修正</div>
          <h1>AI読取結果</h1>
        </div>
        <button className="small-button" type="button" onClick={onReset}>
          撮り直す
        </button>
      </div>

      <StatusBox targetFound={targetFound} targetTitle={targetTitle} warnings={warnings} apiMeta={apiMeta} />

      <details className="image-details">
        <summary>送信した画像を確認</summary>
        <div className="preview-frame compact-frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageDataUrl} alt="OpenAI APIへ送信した撮影画像" />
        </div>
      </details>

      <div className="review-list">
        {BOOKS.map((book) => {
          const row = quantityByNo.get(book.no);
          const quantity = row?.quantity ?? 0;
          const rowAmount = quantity * book.price;
          const needsReview = row?.needsReview ?? true;
          const confidence = row?.confidence ?? 0;
          const isManualQuantity = hasOwnEntry(manualQuantityInputs, book.no);
          const manualQuantityValue = manualQuantityInputs[book.no] ?? '';
          const manualQuantityIsValid = !isManualQuantity || isValidManualQuantity(manualQuantityValue);
          const selectValue = isManualQuantity ? MANUAL_QUANTITY_VALUE : String(Math.min(quantity, 9));
          const selectId = `quantity-select-${book.no}`;
          const manualInputId = `quantity-manual-${book.no}`;

          return (
            <div className={needsReview ? 'review-row needs-review' : 'review-row'} key={book.no}>
              <div className="row-main">
                <span className="book-no">No{book.no}</span>
                <span className="book-title">{book.title}</span>
                <span className="book-price">{formatYen(book.price)}</span>
              </div>

              <div className="quantity-control">
                <label className="sr-only" htmlFor={selectId}>
                  No{book.no} 申込冊数
                </label>
                <div className="quantity-select-wrap">
                  <select
                    id={selectId}
                    className="quantity-select"
                    value={selectValue}
                    onChange={(event) => selectQuantity(book.no, event.currentTarget.value)}
                    aria-label={`No${book.no} 申込冊数`}
                  >
                    <option value="0">0</option>
                    {SINGLE_DIGIT_QUANTITIES.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                    <option value={MANUAL_QUANTITY_VALUE}>10〜99</option>
                  </select>
                </div>

                {isManualQuantity ? (
                  <div className="manual-quantity-field">
                    <label className="manual-quantity-label" htmlFor={manualInputId}>
                      2桁の冊数
                    </label>
                    <div className="quantity-input-wrap">
                      <input
                        id={manualInputId}
                        className="quantity-input quantity-input-manual"
                        inputMode="numeric"
                        pattern="[0-9]{2}"
                        maxLength={2}
                        value={manualQuantityValue}
                        placeholder="10〜99"
                        onChange={(event) => updateManualQuantity(book.no, event.currentTarget.value)}
                        aria-label={`No${book.no} 10冊以上の申込冊数`}
                        aria-invalid={!manualQuantityIsValid}
                        aria-describedby={!manualQuantityIsValid ? `${manualInputId}-error` : undefined}
                      />
                      <span className="unit">冊</span>
                    </div>
                    {!manualQuantityIsValid ? (
                      <span className="quantity-error" id={`${manualInputId}-error`} role="alert">
                        10〜99で入力
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="row-sub">
                <span>小計 {formatYen(rowAmount)}</span>
                <span>
                  AI: {row?.raw || '空欄'} / 確信度 {Math.round(confidence * 100)}%
                  {needsReview ? ' / 要確認' : ''}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <ResultSummary
        totalQuantity={totalQuantity}
        totalAmount={totalAmount}
        onStartBarcode={setBarcodePaymentSummary}
        canStartBarcode={!hasInvalidManualQuantity}
        startBarcodeBlockedMessage="10冊以上を選んだ行は、10〜99冊で入力してください。"
      />
    </section>
  );
}

type StatusBoxProps = {
  targetFound: boolean;
  targetTitle: string;
  warnings: string[];
  apiMeta: FullTableOcrApiSuccess['meta'] | null;
};

function StatusBox({ targetFound, targetTitle, warnings, apiMeta }: StatusBoxProps) {
  const usageText = apiMeta?.usage?.totalTokens ? `${formatNumber(apiMeta.usage.totalTokens)} tokens` : 'token情報なし';

  return (
    <div className={targetFound ? 'status-box success' : 'status-box warning'}>
      <strong>{targetFound ? '対象表を検出しました。' : '対象表の検出に不安があります。'}</strong>
      <p>
        対象: {targetTitle || '未特定'} / モデル: {apiMeta?.model || '不明'} / 使用量: {usageText}
      </p>
      {warnings.length > 0 ? (
        <ul>
          {warnings.map((warning, index) => (
            <li key={`${warning}-${index}`}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
