'use client';

import React, { useState, Children, useRef, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './Stepper.css';

/* ─────────────────────────────────────────────────────────
   TYPES
───────────────────────────────────────────────────────── */
interface StepperProps {
  children: React.ReactNode;
  initialStep?: number;
  onStepChange?: (step: number) => void;
  onFinalStepCompleted?: () => void;
  stepCircleContainerClassName?: string;
  stepContainerClassName?: string;
  contentClassName?: string;
  footerClassName?: string;
  backButtonProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
  nextButtonProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
  backButtonText?: string;
  nextButtonText?: string;
  disableStepIndicators?: boolean;
  renderStepIndicator?: (props: { step: number; currentStep: number; onStepClick: (step: number) => void }) => React.ReactNode;
  [key: string]: unknown;
}

interface StepProps {
  children: React.ReactNode;
}

interface StepContentWrapperProps {
  isCompleted: boolean;
  currentStep: number;
  direction: number;
  children: React.ReactNode;
  className?: string;
}

interface SlideTransitionProps {
  children: React.ReactNode;
  direction: number;
  onHeightReady: (h: number) => void;
}

interface StepIndicatorProps {
  step: number;
  currentStep: number;
  onClickStep: (step: number) => void;
  disableStepIndicators: boolean;
}

interface StepConnectorProps {
  isComplete: boolean;
}

/* ─────────────────────────────────────────────────────────
   STEPPER (main)
───────────────────────────────────────────────────────── */
export default function Stepper({
  children,
  initialStep = 1,
  onStepChange = () => {},
  onFinalStepCompleted = () => {},
  stepCircleContainerClassName = '',
  stepContainerClassName = '',
  contentClassName = '',
  footerClassName = '',
  backButtonProps = {},
  nextButtonProps = {},
  backButtonText = 'Back',
  nextButtonText = 'Continue',
  disableStepIndicators = false,
  renderStepIndicator,
  ...rest
}: StepperProps) {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [direction, setDirection] = useState(0);
  const stepsArray = Children.toArray(children);
  const totalSteps = stepsArray.length;
  const isCompleted = currentStep > totalSteps;
  const isLastStep = currentStep === totalSteps;

  const updateStep = (newStep: number) => {
    setCurrentStep(newStep);
    if (newStep > totalSteps) {
      onFinalStepCompleted();
    } else {
      onStepChange(newStep);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setDirection(-1);
      updateStep(currentStep - 1);
    }
  };

  const handleNext = () => {
    if (!isLastStep) {
      setDirection(1);
      updateStep(currentStep + 1);
    }
  };

  const handleComplete = () => {
    setDirection(1);
    updateStep(totalSteps + 1);
  };

  return (
    <div className="bd-stepper-outer" {...(rest as React.HTMLAttributes<HTMLDivElement>)}>
      <div className={`bd-step-circle-container ${stepCircleContainerClassName}`}>
        {/* Step progress indicators */}
        <div className={`bd-step-indicator-row ${stepContainerClassName}`}>
          {stepsArray.map((_, index) => {
            const stepNumber = index + 1;
            const isNotLastStep = index < totalSteps - 1;
            return (
              <React.Fragment key={stepNumber}>
                {renderStepIndicator ? (
                  renderStepIndicator({
                    step: stepNumber,
                    currentStep,
                    onStepClick: (clicked) => {
                      setDirection(clicked > currentStep ? 1 : -1);
                      updateStep(clicked);
                    },
                  })
                ) : (
                  <StepIndicator
                    step={stepNumber}
                    disableStepIndicators={disableStepIndicators}
                    currentStep={currentStep}
                    onClickStep={(clicked) => {
                      setDirection(clicked > currentStep ? 1 : -1);
                      updateStep(clicked);
                    }}
                  />
                )}
                {isNotLastStep && <StepConnector isComplete={currentStep > stepNumber} />}
              </React.Fragment>
            );
          })}
        </div>

        {/* Step content */}
        <StepContentWrapper
          isCompleted={isCompleted}
          currentStep={currentStep}
          direction={direction}
          className={`bd-step-content-default ${contentClassName}`}
        >
          {stepsArray[currentStep - 1]}
        </StepContentWrapper>

        {/* Footer nav */}
        {!isCompleted && (
          <div className={`bd-footer-container ${footerClassName}`}>
            <div className={`bd-footer-nav ${currentStep !== 1 ? 'spread' : 'end'}`}>
              {currentStep !== 1 && (
                <button
                  onClick={handleBack}
                  className={`bd-back-button ${currentStep === 1 ? 'inactive' : ''}`}
                  {...backButtonProps}
                >
                  {backButtonText}
                </button>
              )}
              <button
                onClick={isLastStep ? handleComplete : handleNext}
                className="bd-next-button"
                {...nextButtonProps}
              >
                {isLastStep ? 'Complete' : nextButtonText}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   STEP CONTENT WRAPPER — animates height
───────────────────────────────────────────────────────── */
function StepContentWrapper({ isCompleted, currentStep, direction, children, className }: StepContentWrapperProps) {
  const [parentHeight, setParentHeight] = useState(0);

  return (
    <motion.div
      className={className}
      style={{ position: 'relative', overflow: 'hidden' }}
      animate={{ height: isCompleted ? 0 : parentHeight }}
      transition={{ type: 'spring', duration: 0.45, bounce: 0.05 }}
    >
      <AnimatePresence initial={false} mode="sync" custom={direction}>
        {!isCompleted && (
          <SlideTransition key={currentStep} direction={direction} onHeightReady={(h) => setParentHeight(h)}>
            {children}
          </SlideTransition>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────
   SLIDE TRANSITION
───────────────────────────────────────────────────────── */
const stepVariants = {
  enter: (dir: number) => ({ x: dir >= 0 ? '-100%' : '100%', opacity: 0, filter: 'blur(4px)' }),
  center: { x: '0%', opacity: 1, filter: 'blur(0px)' },
  exit: (dir: number) => ({ x: dir >= 0 ? '50%' : '-50%', opacity: 0, filter: 'blur(4px)' }),
};

function SlideTransition({ children, direction, onHeightReady }: SlideTransitionProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (containerRef.current) onHeightReady(containerRef.current.offsetHeight);
  }, [children, onHeightReady]);

  return (
    <motion.div
      ref={containerRef}
      custom={direction}
      variants={stepVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
      style={{ position: 'absolute', left: 0, right: 0, top: 0 }}
    >
      {children}
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────
   STEP (exported for consumer use)
───────────────────────────────────────────────────────── */
export function Step({ children }: StepProps) {
  return <div className="bd-step-default">{children}</div>;
}

/* ─────────────────────────────────────────────────────────
   STEP INDICATOR
───────────────────────────────────────────────────────── */
function StepIndicator({ step, currentStep, onClickStep, disableStepIndicators }: StepIndicatorProps) {
  const status = currentStep === step ? 'active' : currentStep < step ? 'inactive' : 'complete';

  return (
    <motion.div
      onClick={() => { if (step !== currentStep && !disableStepIndicators) onClickStep(step); }}
      className="bd-step-indicator"
      style={disableStepIndicators ? { pointerEvents: 'none' } : {}}
      animate={status}
      initial={false}
    >
      <motion.div
        variants={{
          inactive: { scale: 1, backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.25)' },
          active:   { scale: 1.05, backgroundColor: '#0A0A0A', color: '#ffffff' },
          complete: { scale: 1, backgroundColor: '#0A0A0A', color: '#ffffff' },
        }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="bd-step-indicator-inner"
      >
        {status === 'complete' ? (
          <CheckIcon className="bd-check-icon" />
        ) : status === 'active' ? (
          <div className="bd-active-dot" />
        ) : (
          <span className="bd-step-number">{step}</span>
        )}
      </motion.div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────
   STEP CONNECTOR
───────────────────────────────────────────────────────── */
function StepConnector({ isComplete }: StepConnectorProps) {
  return (
    <div className="bd-step-connector">
      <motion.div
        className="bd-step-connector-inner"
        variants={{
          incomplete: { scaleX: 0, backgroundColor: 'transparent' },
          complete:   { scaleX: 1, backgroundColor: '#0A0A0A' },
        }}
        initial={false}
        animate={isComplete ? 'complete' : 'incomplete'}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        style={{ transformOrigin: 'left' }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   CHECK ICON
───────────────────────────────────────────────────────── */
function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <motion.path
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.08, type: 'tween', ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}
