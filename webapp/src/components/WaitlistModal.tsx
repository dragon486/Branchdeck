'use client';

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight, Loader2, CheckCircle2 } from "lucide-react";

interface WaitlistLandingProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function WaitlistModal({
    isOpen,
    onClose,
}: WaitlistLandingProps) {

    /* -------------------------------------------------------------------------- */
    /*                                  FORM DATA                                 */
    /* -------------------------------------------------------------------------- */

    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [company, setCompany] = useState("");
    const [role, setRole] = useState("");

    /* -------------------------------------------------------------------------- */
    /*                                  UI STATE                                  */
    /* -------------------------------------------------------------------------- */

    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState("");

    /* -------------------------------------------------------------------------- */
    /*                            CLOSE ON ESC KEY                                */
    /* -------------------------------------------------------------------------- */

    useEffect(() => {

        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener("keydown", handler);
            document.body.style.overflow = "hidden";
        }

        return () => {
            document.removeEventListener("keydown", handler);
            document.body.style.overflow = "";
        };

    }, [isOpen, onClose]);

    /* -------------------------------------------------------------------------- */
    /*                              SUBMIT FUNCTION                               */
    /* -------------------------------------------------------------------------- */

    const handleJoinWaitlist = async () => {

        // Client-side validation
        if (!fullName.trim()) {
            setError("Please enter your full name.");
            return;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email.trim() || !emailRegex.test(email)) {
            setError("Please enter a valid email address.");
            return;
        }

        setLoading(true);
        setError("");

        try {

            const response = await fetch("/api/waitlist", {

                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                },

                body: JSON.stringify({
                    fullName,
                    email,
                    company,
                    role,
                }),

            });

            const data = await response.json();

            if (!response.ok) {

                setError(data.error || "Something went wrong.");

                setLoading(false);

                return;

            }

            setSuccess(true);

        } catch (err) {

            console.error(err);

            setError("Unable to connect. Please try again.");

        }

        setLoading(false);

    };

    /* -------------------------------------------------------------------------- */
    /*                                   RENDER                                   */
    /* -------------------------------------------------------------------------- */

    return (

        <AnimatePresence>

            {isOpen && (

                <motion.div

                    initial={{ opacity: 0 }}

                    animate={{ opacity: 1 }}

                    exit={{ opacity: 0 }}

                    className="fixed inset-0 z-[999] flex items-center justify-center p-6"

                >

                    {/* BACKDROP */}

                    <motion.div

                        initial={{ opacity: 0 }}

                        animate={{ opacity: 1 }}

                        exit={{ opacity: 0 }}

                        onClick={onClose}

                        className="absolute inset-0 bg-black/70 backdrop-blur-lg"

                    />

                    {/* MODAL */}

                    <motion.div

                        initial={{
                            opacity: 0,
                            y: 30,
                            scale: .95
                        }}

                        animate={{
                            opacity: 1,
                            y: 0,
                            scale: 1
                        }}

                        exit={{
                            opacity: 0,
                            y: 30,
                            scale: .95
                        }}

                        transition={{
                            duration: .35
                        }}

                        className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-2xl"

                    >

                        {/* CLOSE */}

                        <button

                            onClick={onClose}

                            className="absolute right-5 top-5 z-20 rounded-full border border-neutral-200 bg-white p-2 transition hover:rotate-90 hover:bg-neutral-100"

                        >

                            <X className="h-4 w-4" />

                        </button>

                        {/* HEADER */}

                        <div className="border-b border-neutral-100 px-10 pt-10 pb-8">

                            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-black text-white">

                                BD

                            </div>

                            <h2 className="text-3xl font-bold tracking-tight text-black">
                                Get Instant Access
                            </h2>

                            <p className="mt-4 text-[15px] leading-7 text-neutral-500">
                                Start analyzing and visualizing complex codebases instantly with AI-powered intelligence.
                            </p>

                        </div>
                        {/* FORM */}

                        {!success ? (

                            <div className="px-10 py-8 space-y-6">

                                <div>
                                    <label className="block text-sm font-semibold text-neutral-800 mb-2">
                                        Full Name
                                    </label>

                                    <input
                                        type="text"
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        placeholder="Adel Muhammed"
                                        className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-[15px] outline-none transition-all focus:border-black"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-neutral-800 mb-2">
                                        Work Email
                                    </label>

                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="you@company.com"
                                        className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-[15px] outline-none transition-all focus:border-black"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-neutral-800 mb-2">
                                        Company
                                    </label>

                                    <input
                                        type="text"
                                        value={company}
                                        onChange={(e) => setCompany(e.target.value)}
                                        placeholder="Acme Inc."
                                        className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-[15px] outline-none transition-all focus:border-black"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-neutral-800 mb-2">
                                        Your Role
                                    </label>

                                    <select
                                        value={role}
                                        onChange={(e) => setRole(e.target.value)}
                                        className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-[15px] outline-none transition-all focus:border-black"
                                    >
                                        <option value="">Select your role</option>
                                        <option>Software Engineer</option>
                                        <option>Senior Engineer</option>
                                        <option>Tech Lead</option>
                                        <option>Engineering Manager</option>
                                        <option>Founder</option>
                                        <option>CTO</option>
                                        <option>Student</option>
                                        <option>Other</option>
                                    </select>
                                </div>

                                {error && (

                                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                                        {error}
                                    </div>

                                )}

                                <button

                                    disabled={
                                        loading ||
                                        !fullName ||
                                        !email ||
                                        !company ||
                                        !role
                                    }

                                    onClick={handleJoinWaitlist}

                                    className="group flex w-full items-center justify-center gap-2 rounded-xl bg-black py-4 text-sm font-semibold text-white transition-all hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"

                                >

                                    {loading ? (

                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Getting Access...
                                        </>

                                    ) : (

                                        <>
                                            Get Started Free

                                            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                                        </>

                                    )}

                                </button>

                                <p className="text-center text-xs leading-6 text-neutral-500">
                                    Instant access to all features, VS Code extension, and interactive codebase maps.
                                </p>

                            </div>

                        ) : (<div className="flex flex-col items-center justify-center px-10 py-14">

                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{
                                    type: "spring",
                                    stiffness: 260,
                                    damping: 18,
                                }}
                                className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-500 text-white"
                            >
                                <CheckCircle2 className="h-10 w-10" />
                            </motion.div>

                            <h2 className="text-3xl font-bold tracking-tight text-black">
                                You're on the waitlist!
                            </h2>

                            <p className="mt-4 max-w-md text-center text-[15px] leading-7 text-neutral-500">
                                Thanks for joining Branchdeck's private beta.
                                We'll reach out as soon as your invite is ready.
                            </p>

                            <div className="mt-8 w-full rounded-2xl border border-neutral-200 bg-neutral-50 p-5">

                                <div className="flex items-center justify-between text-sm">

                                    <span className="text-neutral-500">
                                        Registered Email
                                    </span>

                                    <span className="font-semibold text-black">
                                        {email}
                                    </span>

                                </div>

                                {company && (

                                    <div className="mt-4 flex items-center justify-between text-sm">

                                        <span className="text-neutral-500">
                                            Company
                                        </span>

                                        <span className="font-semibold text-black">
                                            {company}
                                        </span>

                                    </div>

                                )}

                            </div>

                            <button
                                onClick={() => {

                                    setSuccess(false);
                                    setFullName("");
                                    setEmail("");
                                    setCompany("");
                                    setRole("");
                                    setError("");

                                    onClose();

                                }}
                                className="mt-8 w-full rounded-xl bg-black py-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
                            >
                                Close
                            </button>

                        </div>

                        )}

                    </motion.div>

                </motion.div>

            )}

        </AnimatePresence>

    );

}