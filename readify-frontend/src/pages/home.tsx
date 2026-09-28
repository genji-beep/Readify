import { BookOpen, Users, Sparkles, Star, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export default function Home() {
    return (
        <div className="min-h-screen bg-[#F5F6FA]">
            {/* Navbar: pinned to the top edge so it never collides with hero content */}
            <nav className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4 py-4 sm:px-10 sm:py-6">
                <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                        <BookOpen className="text-white" size={22} />
                    </div>
                    <span className="text-xl sm:text-2xl font-bold text-white">Readify</span>
                </div>

                <div className="flex items-center gap-2 sm:gap-4">
                    <Link
                        to="/login"
                        className="text-white border border-white/50 px-4 py-2 text-sm sm:px-5 sm:text-base rounded-xl font-semibold transition hover:bg-white/10 lg:bg-white lg:text-indigo-600 lg:border-transparent lg:hover:bg-white lg:hover:shadow-lg"
                    >
                        Login
                    </Link>
                    <Link
                        to="/signup"
                        className="bg-white text-indigo-600 px-4 py-2 text-sm sm:px-5 sm:text-base rounded-xl font-semibold hover:shadow-lg transition"
                    >
                        Sign Up
                    </Link>
                </div>
            </nav>

            {/* Hero */}
            <section className="grid lg:grid-cols-2 lg:min-h-screen">
                {/* Left Side */}
                <div className="relative bg-gradient-to-br from-[#5A4EF8] via-[#5546E8] to-[#4338CA] overflow-hidden flex items-start lg:items-center px-6 pt-28 pb-14 sm:px-10 sm:pt-32 sm:pb-16 lg:px-14 lg:pt-0 lg:pb-0">
                    {/* Decorative Blobs */}
                    <div className="absolute w-72 h-72 rounded-full bg-white/10 blur-3xl -top-20 -left-20"></div>
                    <div className="absolute w-96 h-96 rounded-full bg-indigo-300/10 blur-3xl bottom-0 right-0"></div>

                    <div className="relative z-10 max-w-xl text-white">
                        <div className="inline-flex items-center gap-2 bg-white/10 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full mb-5 sm:mb-8 backdrop-blur">
                            <Sparkles size={16} className="shrink-0" />
                            <span className="text-xs sm:text-sm">
                                Your Personalized Reading Companion
                            </span>
                        </div>

                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight">
                            Discover Your
                            <br />
                            <span className="text-indigo-100">Next Favorite Book.</span>
                        </h1>

                        <p className="mt-5 sm:mt-8 text-base sm:text-lg text-indigo-100 leading-7 sm:leading-8">
                            Readify connects readers with books they'll love using intelligent
                            recommendations, honest community reviews, and personalized
                            reading lists.
                        </p>

                        <Link
                            to="/signup"
                            className="lg:hidden mt-7 inline-flex items-center gap-2 bg-white text-indigo-600 px-6 py-3 rounded-xl font-semibold shadow-lg"
                        >
                            Get Started
                            <ArrowRight size={18} />
                        </Link>
                    </div>
                </div>

                {/* Right Side */}
                <div className="flex items-center justify-center px-6 py-12 sm:px-12 sm:py-20">
                    <div className="max-w-xl w-full">
                        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
                            Why Choose Readify?
                        </h2>

                        <p className="text-gray-500 mb-8 sm:mb-10 text-base sm:text-lg">
                            More than just a book catalog—Readify helps you build meaningful
                            reading habits while connecting with a passionate community.
                        </p>

                        <div className="grid gap-4 sm:gap-6">
                            <div className="bg-white rounded-3xl shadow-lg p-5 sm:p-7 flex gap-4 sm:gap-5 hover:-translate-y-1 transition">
                                <div className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-2xl bg-indigo-100 flex items-center justify-center">
                                    <Sparkles className="text-indigo-600" />
                                </div>

                                <div>
                                    <h3 className="font-bold text-lg sm:text-xl text-gray-900">
                                        Smart Recommendations
                                    </h3>
                                    <p className="text-gray-500 mt-2">
                                        AI-powered suggestions based on your reading history and
                                        interests.
                                    </p>
                                </div>
                            </div>

                            <div className="bg-white rounded-3xl shadow-lg p-5 sm:p-7 flex gap-4 sm:gap-5 hover:-translate-y-1 transition">
                                <div className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-2xl bg-indigo-100 flex items-center justify-center">
                                    <Users className="text-indigo-600" />
                                </div>

                                <div>
                                    <h3 className="font-bold text-lg sm:text-xl text-gray-900">
                                        Community Reviews
                                    </h3>
                                    <p className="text-gray-500 mt-2">
                                        Discover honest reviews, ratings, and recommendations from
                                        thousands of passionate readers.
                                    </p>
                                </div>
                            </div>

                            <div className="bg-white rounded-3xl shadow-lg p-5 sm:p-7 flex gap-4 sm:gap-5 hover:-translate-y-1 transition">
                                <div className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-2xl bg-indigo-100 flex items-center justify-center">
                                    <Star className="text-indigo-600" />
                                </div>

                                <div>
                                    <h3 className="font-bold text-lg sm:text-xl text-gray-900">
                                        Track Your Reading
                                    </h3>
                                    <p className="text-gray-500 mt-2">
                                        Save books, create reading lists, and monitor your reading
                                        journey effortlessly.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 sm:mt-10">
                            <Link
                                to="/signup"
                                className="w-full sm:w-auto justify-center inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 sm:px-8 sm:py-4 rounded-xl font-semibold transition"
                            >
                                Join Readify Today
                                <ArrowRight size={18} />
                            </Link>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}