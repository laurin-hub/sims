import { useCallback, useState } from "react";
import { ApiError } from "../api/http";

export type FormErrors = Record<string, string>;

export interface UseFormResult<T> {
  values: T;
  errors: FormErrors;
  submitting: boolean;
  setFieldValue: (name: keyof T, value: string | number | boolean) => void;
  setError: (name: keyof T | "__form__", message: string) => void;
  setErrors: (errors: FormErrors) => void;
  reset: () => void;
  withSubmitting: (run: () => Promise<void>) => Promise<boolean>;
}

/**
 * Leichtgewichtiges Formular-Handling: Werte, Feldfehler, Submit-Schutz und
 * zentrale Fehleruebernahme aus ApiError (Backend-Meldungen haben Vorrang).
 */
export function useForm<T extends Record<string, string | number | boolean>>(
  initial: T
): UseFormResult<T> {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrorsState] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const setFieldValue = useCallback(
    (name: keyof T, value: string | number | boolean) => {
      setValues((current) => ({ ...current, [name]: value }));
      setErrorsState((current) => {
        if (!(name in current)) return current;
        const next = { ...current };
        delete next[name as string];
        return next;
      });
    },
    []
  );

  const setError = useCallback((name: keyof T | "__form__", message: string) => {
    setErrorsState((current) => ({ ...current, [name as string]: message }));
  }, []);

  const setErrors = useCallback((next: FormErrors) => {
    setErrorsState(next);
  }, []);

  const reset = useCallback(() => {
    setValues(initial);
    setErrorsState({});
  }, [initial]);

  const withSubmitting = useCallback(
    async (run: () => Promise<void>): Promise<boolean> => {
      if (submitting) return false;
      setSubmitting(true);
      setErrorsState({});
      try {
        await run();
        return true;
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : "Die Anfrage konnte nicht verarbeitet werden. Bitte spaeter erneut versuchen.";
        setErrorsState({ __form__: message });
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [submitting]
  );

  return { values, errors, submitting, setFieldValue, setError, setErrors, reset, withSubmitting };
}
