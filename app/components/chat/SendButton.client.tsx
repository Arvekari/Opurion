import { AnimatePresence, cubicBezier, motion } from 'framer-motion';
import { uiButtonClassTokens } from '~/components/ui/tokens';

interface SendButtonProps {
  show: boolean;
  isStreaming?: boolean;
  disabled?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  onImagesSelected?: (images: File[]) => void;
}

const customEasingFn = cubicBezier(0.4, 0, 0.2, 1);

export const SendButton = ({ show, isStreaming, disabled, onClick }: SendButtonProps) => {
  return (
    <AnimatePresence>
      {show ? (
        <motion.button
          className="w-8 h-8 rounded-md transition-theme text-white flex items-center justify-center"
          style={{ backgroundColor: '#F59E0B' }}
          transition={{ ease: customEasingFn, duration: 0.17 }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          disabled={disabled}
          aria-label={isStreaming ? 'Stop response' : 'Send message'}
          onClick={(event) => {
            event.preventDefault();

            if (!disabled) {
              onClick?.(event);
            }
          }}
          title={isStreaming ? 'Stop' : 'Send'}
        >
          <div className="text-lg" style={{ opacity: disabled ? 0.55 : 1 }}>
            {!isStreaming ? <div className="i-ph:arrow-right"></div> : <div className="i-ph:stop-circle-bold"></div>}
          </div>
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
};
