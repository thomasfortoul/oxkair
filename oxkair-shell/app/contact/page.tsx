export default function ContactPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Contact Us</h1>
        <p className="text-lg text-gray-600">
          Get in touch with the Oxkair team for support and inquiries
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-12">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Get in Touch</h2>
          <div className="space-y-4">
          
            <div>
              <h3 className="font-medium text-gray-900">Technical Support</h3>
              <p className="text-gray-600">thomas@oxkair.com</p>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Business Hours</h3>
              <p className="text-gray-600">Monday - Friday, 9:00 AM - 6:00 PM EST</p>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-6">About Oxkair</h2>
          <p className="text-gray-600 mb-4">
            Oxkair Platform is a comprehensive Medical AI Suite designed for healthcare 
            professionals to streamline coding, documentation, and clinical workflows.
          </p>
          <p className="text-gray-600">
            Our platform combines advanced AI technology with intuitive user interfaces 
            to help healthcare providers deliver better patient care while reducing 
            administrative burden.
          </p>
        </div>
      </div>
    </div>
  );
}