"use client"

import { useState, useEffect } from "react"
import { MessageCircle, X, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useTheme } from "@/contexts/theme-context"
import { useUser } from "@clerk/nextjs"
import { useToast } from "@/hooks"
import clsx from "clsx"
import { supabase } from "@/lib/database/supabase"

interface FeedbackWidgetProps {
  position?: "bottom-left" | "bottom-right"
}

export function FeedbackWidget({ position = "bottom-left" }: FeedbackWidgetProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { theme } = useTheme()
  const { user } = useUser()
  const { toast } = useToast()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = theme === "dark"
  const positionClass = position === "bottom-left" ? "bottom-6 left-6" : "bottom-6 right-6"

  const handleSubmit = async () => {
    if (!message.trim()) {
      toast({
        title: "Error",
        description: "Please enter your feedback",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)
    try {
      const feedbackMessage = selectedCategory
        ? `[${selectedCategory}] ${message.trim()}`
        : message.trim()

      const { error } = await supabase.from("feedback").insert({
        user_id: user?.id || null,
        message: feedbackMessage,
        created_at: new Date().toISOString(),
      })

      if (error) throw error

      toast({
        title: "Thank you!",
        description: "Your feedback has been received. We appreciate your input!",
      })

      setMessage("")
      setSelectedCategory(null)
      setIsOpen(false)
    } catch (error) {
      console.error("Error submitting feedback:", error)
      toast({
        title: "Error",
        description: "Failed to submit feedback. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCloseModal = () => {
    setIsOpen(false)
    setMessage("")
    setSelectedCategory(null)
  }

  if (!mounted) {
    return null
  }

  return (
    <>
      {/* Feedback Button Circle */}
      <button
        onClick={() => setIsOpen(true)}
        className={clsx(
          "fixed z-40 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 cursor-pointer",
          positionClass,
          isDark
            ? "bg-blue-600 text-white hover:bg-blue-700"
            : "bg-blue-500 text-white hover:bg-blue-600"
        )}
        title="Send us feedback"
      >
        <MessageCircle className="w-6 h-6" />
      </button>

      {/* Feedback Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={handleCloseModal}
          />

          {/* Modal Content */}
          <div
            className={clsx(
              "relative rounded-lg shadow-2xl p-6 max-w-md w-full",
              isDark ? "bg-[#181813] border border-[#e8dcc4]/30" : "bg-white border border-gray-200"
            )}
          >
            {/* Close Button */}
            <button
              onClick={handleCloseModal}
              className={clsx(
                "absolute top-4 right-4 p-1 rounded hover:bg-gray-200",
                isDark ? "text-[#e8dcc4] hover:bg-[#e8dcc4]/10" : "text-gray-600 hover:bg-gray-100"
              )}
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="mb-4">
              <h2 className={clsx("text-lg font-semibold mb-1", isDark ? "text-[#e8dcc4]" : "text-gray-900")}>
                Send us Feedback
              </h2>
              <p className={clsx("text-sm", isDark ? "text-[#e8dcc4]/60" : "text-gray-600")}>
                We'd love to hear your suggestions, concerns, or feedback to help us improve Secret Sauce.
              </p>
            </div>

            {/* Feedback Categories */}
            <div className="mb-4 space-y-2">
              <p className={clsx("text-xs font-medium uppercase tracking-widest", isDark ? "text-[#e8dcc4]/60" : "text-gray-500")}>
                What's on your mind?
              </p>
              <div className="flex flex-wrap gap-2">
                {["Suggestion", "Bug Report", "Concern", "Other"].map((category) => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(selectedCategory === category ? null : category)}
                    className={clsx(
                      "px-3 py-1 text-xs rounded-full border transition-colors cursor-pointer font-medium",
                      selectedCategory === category
                        ? isDark
                          ? "border-blue-500 bg-blue-600/30 text-blue-300"
                          : "border-blue-400 bg-blue-50 text-blue-700"
                        : isDark
                          ? "border-[#e8dcc4]/30 text-[#e8dcc4] hover:border-[#e8dcc4]/60 hover:bg-[#e8dcc4]/10"
                          : "border-gray-300 text-gray-700 hover:border-gray-400 hover:bg-gray-50"
                    )}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            {/* Textarea */}
            <div className="mb-4">
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Share your thoughts here..."
                className={clsx(
                  "min-h-[120px] resize-none",
                  isDark
                    ? "bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4] placeholder:text-[#e8dcc4]/30"
                    : "bg-white border-gray-300 text-gray-900 placeholder:text-gray-400"
                )}
              />
              <p className={clsx("text-xs mt-1", isDark ? "text-[#e8dcc4]/40" : "text-gray-500")}>
                {message.length} / 500 characters
              </p>
            </div>

            {/* Buttons */}
            <div className="flex gap-2">
              <Button
                onClick={handleCloseModal}
                variant="ghost"
                className={clsx(
                  "flex-1",
                  isDark
                    ? "text-[#e8dcc4]/60 hover:text-[#e8dcc4] hover:bg-[#e8dcc4]/10"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                )}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !message.trim()}
                className={clsx(
                  "flex-1 flex items-center justify-center gap-2",
                  isDark ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-blue-500 text-white hover:bg-blue-600"
                )}
              >
                {isSubmitting ? "Sending..." : <>
                  Send
                  <Send className="w-4 h-4" />
                </>}
              </Button>
            </div>

            {/* Disclaimer */}
            <p className={clsx("text-xs mt-4 text-center", isDark ? "text-[#e8dcc4]/40" : "text-gray-500")}>
              Your feedback helps us build a better experience.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
